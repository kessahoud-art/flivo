const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' })
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  const { plan_voulu } = req.body // 'pro' ou 'business'
  const maintenant = new Date()

  // Enregistrer l'intention d'upgrade
  const { error } = await supabase.from('vendeurs').update({
    upgrade_intent:          true,
    payment_status:          'pending',
    relance_step:            0,
    last_whatsapp_click_at:  maintenant.toISOString()
  }).eq('id', user.id)

  if (error) return res.status(500).json({ error: error.message })

  // Log la relance initiale
  await supabase.from('relance_logs').insert({
    vendeur_id: user.id,
    type:       'upgrade',
    step:       0,
    message:    `Clic WhatsApp upgrade enregistré — plan voulu : ${plan_voulu || 'pro'}`
  })

  console.log(`📱 WhatsApp click upgrade — ${user.email} — plan : ${plan_voulu}`)

  return res.status(200).json({
    success: true,
    message: 'Intention d\'upgrade enregistrée. Relances activées.'
  })
}
