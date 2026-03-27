const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function genCode() {
  return `TRK-${Math.floor(10000 + Math.random() * 90000)}`
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  // ── Auth ──────────────────────────────────────
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' })
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  const { data: v } = await supabase
    .from('vendeurs').select('*').eq('id', user.id).single()

  if (!v) return res.status(404).json({ error: 'Vendeur introuvable' })

  const maintenant = new Date()
  let planActuel = v.plan || 'free'

  // ── Vérification 1 : Plan Pro expiré ─────────
  if (planActuel === 'pro' && v.pro_expires_at) {
    if (new Date(v.pro_expires_at) < maintenant) {
      // Expiré → blocked, JAMAIS free
      await supabase.from('vendeurs').update({
        plan: 'blocked',
        free_blocked: true,
        blocked_at: maintenant.toISOString()
      }).eq('id', user.id)
      planActuel = 'blocked'
    }
  }

  // ── Vérification 2 : Bloqué ───────────────────
  if (planActuel === 'blocked' || v.free_blocked) {
    return res.status(403).json({
      error: 'compte_bloque',
      plan: planActuel,
      redirect: '/upgrade.html',
      message: planActuel === 'blocked'
        ? 'Ton plan Pro a expiré. Renouvelle pour continuer à livrer.'
        : 'Tu as utilisé tes 20 livraisons gratuites. Passe au Pro pour continuer.'
    })
  }

  // ── Vérification 3 : Quota Free ───────────────
  const estPro = planActuel === 'pro'
  if (!estPro) {
    const count = v.deliveries_count || 0
    if (count >= 20) {
      // Bloquer le compte free
      await supabase.from('vendeurs').update({ free_blocked: true }).eq('id', user.id)
      return res.status(403).json({
        error: 'quota_atteint',
        redirect: '/upgrade.html',
        message: 'Tu as atteint les 20 livraisons gratuites. Passe au Pro pour continuer.'
      })
    }
  }

  // ── Validation des champs ─────────────────────
  const { client_nom, client_phone, adresse, montant, livreur_nom, livreur_phone } = req.body
  if (!client_nom || !client_phone || !adresse || !montant || !livreur_nom || !livreur_phone) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires' })
  }

  // ── Générer code unique ───────────────────────
  let code = genCode()
  for (let i = 0; i < 5; i++) {
    const { data: ex } = await supabase.from('livraisons').select('id').eq('code', code).single()
    if (!ex) break
    code = genCode()
  }

  // ── Créer la livraison ────────────────────────
  const { data, error } = await supabase
    .from('livraisons')
    .insert({
      code,
      vendeur_id:   user.id,
      boutique_nom: v.nom_boutique || 'Boutique',
      client_nom, client_phone, adresse,
      montant:      Number(montant),
      livreur_nom, livreur_phone,
      statut:       0
    })
    .select().single()

  if (error || !data) {
    console.error('Erreur création livraison:', error?.message)
    return res.status(500).json({ error: 'Erreur création', detail: error?.message })
  }

  // ── Incrémenter le compteur ───────────────────
  const newCount = (v.deliveries_count || 0) + 1
  const updates  = { deliveries_count: newCount }

  // Si on atteint 20 → bloquer immédiatement pour la prochaine fois
  if (!estPro && newCount >= 20) {
    updates.free_blocked = true
  }

  await supabase.from('vendeurs').update(updates).eq('id', user.id)

  const appUrl = process.env.APP_URL || 'https://flivo.vercel.app'
  return res.status(200).json({
    success: true,
    livraison: data,
    liens: {
      client:  `${appUrl}/track.html?code=${code}`,
      livreur: `${appUrl}/livreur.html?code=${code}`
    },
    // Avertir si c'est la dernière livraison gratuite
    avertissement: !estPro && newCount === 20
      ? 'Ceci était ta dernière livraison gratuite. Passe au Pro pour continuer.'
      : null
  })
}
