const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function genCode() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `TRK-${n}`
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  // Auth
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' })
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  // Récupérer le vendeur
  const { data: vendeur } = await supabase
    .from('vendeurs').select('*').eq('id', user.id).single()

  // ── Vérification expiration plan ──────────────
  const maintenant = new Date()
  let planActuel = vendeur?.plan || 'free'

  if (planActuel !== 'free' && vendeur?.plan_expire_le) {
    if (new Date(vendeur.plan_expire_le) < maintenant) {
      // Plan expiré → auto-repassage en free
      await supabase.from('vendeurs')
        .update({ plan: 'free' })
        .eq('id', user.id)
      planActuel = 'free'
    }
  }

  // ── Vérification quota ────────────────────────
  const estPaye = planActuel === 'pro' || planActuel === 'business'
  if (!estPaye && (vendeur?.livraisons_ce_mois || 0) >= 20) {
    return res.status(403).json({
      error: 'quota_atteint',
      redirect: '/upgrade.html',
      message: 'Tu as atteint les 20 livraisons gratuites ce mois.'
    })
  }

  const { client_nom, client_phone, adresse, montant, livreur_nom, livreur_phone } = req.body
  if (!client_nom || !client_phone || !adresse || !montant || !livreur_nom || !livreur_phone) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires' })
  }

  // Générer code unique
  let code = genCode()
  for (let i = 0; i < 5; i++) {
    const { data: ex } = await supabase.from('livraisons').select('id').eq('code', code).single()
    if (!ex) break
    code = genCode()
  }

  // Créer la livraison
  const { data, error } = await supabase
    .from('livraisons')
    .insert({
      code,
      vendeur_id:   user.id,
      boutique_nom: vendeur?.nom_boutique || 'Boutique',
      client_nom, client_phone, adresse,
      montant:      Number(montant),
      livreur_nom, livreur_phone,
      statut:       0
    })
    .select().single()

  if (error || !data) return res.status(500).json({ error: 'Erreur création', detail: error?.message })

  // Incrémenter compteur
  await supabase.from('vendeurs')
    .update({ livraisons_ce_mois: (vendeur?.livraisons_ce_mois || 0) + 1 })
    .eq('id', user.id)

  const appUrl = process.env.APP_URL || 'https://flivo.vercel.app'
  return res.status(200).json({
    success: true,
    livraison: data,
    liens: {
      client:  `${appUrl}/track.html?code=${code}`,
      livreur: `${appUrl}/livreur.html?code=${code}`
    }
  })
}
