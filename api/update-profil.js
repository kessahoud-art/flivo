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

  const { nom_boutique, phone } = req.body
  if (!nom_boutique || !phone) return res.status(400).json({ error: 'Tous les champs sont requis' })

  const { data, error } = await supabase
    .from('vendeurs')
    .update({ nom_boutique, phone })
    .eq('id', user.id)
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ success: true, vendeur: data })
}
