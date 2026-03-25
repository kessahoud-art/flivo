const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' })
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  // POST → ajouter un livreur
  if (req.method === 'POST') {
    const { nom, phone } = req.body
    if (!nom || !phone) return res.status(400).json({ error: 'Nom et téléphone requis' })

    const { data, error } = await supabase
      .from('livreurs')
      .insert({ vendeur_id: user.id, nom, phone })
      .select().single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, livreur: data })
  }

  // DELETE → désactiver un livreur
  if (req.method === 'DELETE') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'ID requis' })

    const { error } = await supabase
      .from('livreurs')
      .update({ actif: false })
      .eq('id', id)
      .eq('vendeur_id', user.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Méthode non autorisée' })
}
