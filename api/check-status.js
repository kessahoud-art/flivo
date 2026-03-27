const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' })
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  const { data: v, error } = await supabase
    .from('vendeurs')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !v) return res.status(404).json({ error: 'Vendeur introuvable' })

  const maintenant = new Date()

  // ── Vérifier expiration Pro ───────────────────
  let planActuel = v.plan || 'free'
  if (planActuel === 'pro' && v.pro_expires_at) {
    if (new Date(v.pro_expires_at) < maintenant) {
      // Expiration → blocked (jamais free)
      await supabase.from('vendeurs').update({
        plan: 'blocked',
        free_blocked: true,
        blocked_at: maintenant.toISOString()
      }).eq('id', user.id)
      planActuel = 'blocked'
    }
  }

  const estPro       = planActuel === 'pro'
  const estBlocked   = planActuel === 'blocked' || v.free_blocked
  const peutLivrer   = !estBlocked

  // Jours restants plan Pro
  let joursRestants = null
  if (estPro && v.pro_expires_at) {
    const diff = new Date(v.pro_expires_at) - maintenant
    joursRestants = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  return res.status(200).json({
    plan:               planActuel,
    free_blocked:       v.free_blocked || false,
    deliveries_count:   v.deliveries_count || 0,
    limite_free:        20,
    peut_livrer:        peutLivrer,
    est_pro:            estPro,
    est_blocked:        estBlocked,
    has_used_free_trial: v.has_used_free_trial || false,
    upgrade_intent:     v.upgrade_intent || false,
    payment_status:     v.payment_status || 'none',
    pro_expires_at:     v.pro_expires_at || null,
    jours_restants:     joursRestants,
    expire_bientot:     joursRestants !== null && joursRestants <= 5,
    nom_boutique:       v.nom_boutique,
    email:              v.email
  })
}
