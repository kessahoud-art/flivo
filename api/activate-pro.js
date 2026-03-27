const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const PLANS_VALIDES = ['pro', 'business']

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  // ── Sécurité : admin uniquement ──────────────
  const secret = req.headers['x-admin-secret'] || req.query.secret
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Accès non autorisé' })
  }

  const { vendeur_id, email, plan, duree_jours } = req.body

  if (!plan || !PLANS_VALIDES.includes(plan)) {
    return res.status(400).json({ error: 'Plan invalide. Valeurs : pro, business' })
  }

  if (!vendeur_id && !email) {
    return res.status(400).json({ error: 'vendeur_id ou email requis' })
  }

  const maintenant  = new Date()
  const duree       = Number(duree_jours) || 30
  const expireDate  = new Date(maintenant)
  expireDate.setDate(expireDate.getDate() + duree)

  // Trouver le vendeur
  let query = supabase.from('vendeurs').select('id, email, nom_boutique, plan, phone')
  if (vendeur_id) query = query.eq('id', vendeur_id)
  else query = query.eq('email', email)

  const { data: vendeur, error: findErr } = await query.single()
  if (findErr || !vendeur) return res.status(404).json({ error: 'Vendeur introuvable' })

  // Activer le plan
  const { error: updateErr } = await supabase.from('vendeurs').update({
    plan,
    payment_status:   'confirmed',
    upgrade_intent:   false,
    free_blocked:     false,
    relance_step:     0,
    pro_started_at:   maintenant.toISOString(),
    pro_expires_at:   expireDate.toISOString(),
    blocked_at:       null,
    relance_expire_step:    0,
    last_expire_relance_at: null
  }).eq('id', vendeur.id)

  if (updateErr) return res.status(500).json({ error: updateErr.message })

  // Log l'activation
  await supabase.from('relance_logs').insert({
    vendeur_id: vendeur.id,
    type:       'activation',
    step:       0,
    message:    `Plan ${plan} activé par admin — expire le ${expireDate.toLocaleDateString('fr-FR')}`
  })

  console.log(`✅ Plan ${plan} activé — ${vendeur.email} — expire le ${expireDate.toDateString()}`)

  return res.status(200).json({
    success:    true,
    vendeur:    vendeur.email,
    boutique:   vendeur.nom_boutique,
    plan,
    expire_le:  expireDate.toISOString(),
    duree_jours: duree
  })
}
