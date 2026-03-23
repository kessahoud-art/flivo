const { createClient } = require('@supabase/supabase-js')
const sendWhatsApp = require('./send-whatsapp')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  const token = authHeader.split(' ')[1]
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Token invalide' })

  // Récupérer le vendeur
  const { data: vendeur } = await supabase
    .from('vendeurs')
    .select('*')
    .eq('id', user.id)
    .single()

  // Vérifier quota plan free
  if (vendeur?.plan === 'free' && vendeur?.livraisons_ce_mois >= 20) {
    return res.status(403).json({
      error: 'quota_atteint',
      message: 'Tu as atteint les 20 livraisons gratuites ce mois. Passe au plan Pro pour continuer.'
    })
  }

  const { client_nom, client_phone, adresse, montant, livreur_nom, livreur_phone } = req.body

  if (!client_nom || !client_phone || !adresse || !montant || !livreur_nom || !livreur_phone) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires' })
  }

  // Générer un code unique
  let code = genCode()
  let tentatives = 0
  while (tentatives < 5) {
    const { data: existing } = await supabase.from('livraisons').select('id').eq('code', code).single()
    if (!existing) break
    code = genCode()
    tentatives++
  }

  // Créer la livraison
  const { data, error } = await supabase
    .from('livraisons')
    .insert({
      code,
      vendeur_id: user.id,
      boutique_nom: vendeur?.nom_boutique || 'Boutique',
      client_nom,
      client_phone,
      adresse,
      montant: Number(montant),
      livreur_nom,
      livreur_phone,
      statut: 0
    })
    .select()
    .single()

  if (error || !data) {
    return res.status(500).json({ error: 'Erreur création', detail: error?.message })
  }

  // Incrémenter le compteur
  await supabase
    .from('vendeurs')
    .update({ livraisons_ce_mois: (vendeur?.livraisons_ce_mois || 0) + 1 })
    .eq('id', user.id)

  // Générer les liens
  const appUrl = process.env.APP_URL || 'https://flivo.vercel.app'
  const lienClient  = `${appUrl}/track.html?code=${code}`
  const lienLivreur = `${appUrl}/livreur.html?code=${code}`

  // ── Envoi WhatsApp automatique ──────────────────────────

  const msgClient = `Bonjour ${client_nom} 👋

Votre commande chez *${vendeur?.nom_boutique}* est confirmée !

Suivez votre livraison en temps réel 👇
${lienClient}

🛵 Livreur : ${livreur_nom}
📞 ${livreur_phone}
💵 Montant à payer : ${Number(montant).toLocaleString('fr-FR')} FCFA

Merci pour votre confiance 🙏`

  const msgLivreur = `Bonjour ${livreur_nom} 👋

Nouvelle livraison *#${code}* pour toi !

👤 Client : ${client_nom}
📍 Adresse : ${adresse}
💵 À encaisser : ${Number(montant).toLocaleString('fr-FR')} FCFA

Gère le statut de livraison ici 👇
${lienLivreur}`

  // Envoi en parallèle (non bloquant)
  Promise.all([
    sendWhatsApp(client_phone, msgClient),
    sendWhatsApp(livreur_phone, msgLivreur)
  ]).then(([resClient, resLivreur]) => {
    console.log('WhatsApp client :', resClient)
    console.log('WhatsApp livreur :', resLivreur)
  })

  return res.status(200).json({
    success: true,
    livraison: data,
    liens: { client: lienClient, livreur: lienLivreur }
  })
}
