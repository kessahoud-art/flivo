const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Plans disponibles
const PLANS = {
  pro:      { nom: 'Pro',      duree_jours: 30  },
  business: { nom: 'Business', duree_jours: 30  },
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  // ── Vérification signature Chariow ──────────────────────
  // Chariow envoie un header x-chariow-signature ou similaire
  // Pour l'instant on vérifie juste le secret partagé
  const secret = req.headers['x-webhook-secret']
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Signature invalide' })
  }

  const { email, plan, transaction_id, statut } = req.body

  // On agit uniquement sur les paiements réussis
  if (statut !== 'success' && statut !== 'completed') {
    return res.status(200).json({ message: 'Paiement ignoré (statut: ' + statut + ')' })
  }

  if (!email || !plan || !PLANS[plan]) {
    return res.status(400).json({ error: 'Données manquantes ou plan invalide' })
  }

  // Calculer la date d'expiration
  const expireDate = new Date()
  expireDate.setDate(expireDate.getDate() + PLANS[plan].duree_jours)

  // Mettre à jour le vendeur
  const { data, error } = await supabase
    .from('vendeurs')
    .update({
      plan,
      plan_expire_le: expireDate.toISOString(),
    })
    .eq('email', email)
    .select()
    .single()

  if (error || !data) {
    console.error('Erreur activation plan :', error?.message)
    return res.status(500).json({ error: 'Erreur activation plan' })
  }

  console.log(`✅ Plan ${plan} activé pour ${email} — expire le ${expireDate.toDateString()}`)

  return res.status(200).json({
    success: true,
    message: `Plan ${PLANS[plan].nom} activé pour ${email}`,
    expire_le: expireDate.toISOString()
  })
}
