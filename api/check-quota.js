const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  const { data: vendeur, error } = await supabase
    .from('vendeurs')
    .select('plan, livraisons_ce_mois, plan_expire_le')
    .eq('id', user.id)
    .single()

  if (error || !vendeur) return res.status(404).json({ error: 'Vendeur introuvable' })

  const isPro     = vendeur.plan === 'pro' || vendeur.plan === 'business'
  const limite    = isPro ? 999999 : 20
  const restant   = Math.max(0, limite - (vendeur.livraisons_ce_mois || 0))
  const bloque    = !isPro && (vendeur.livraisons_ce_mois || 0) >= 20

  return res.status(200).json({
    plan:               vendeur.plan,
    livraisons_ce_mois: vendeur.livraisons_ce_mois || 0,
    limite,
    restant,
    bloque,
    plan_expire_le:     vendeur.plan_expire_le || null
  })
}
