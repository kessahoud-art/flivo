const { createClient } = require('@supabase/supabase-js')
const sendWhatsApp = require('./send-whatsapp')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const { code, statut } = req.body

  if (!code || statut === undefined) {
    return res.status(400).json({ error: 'Code ou statut manquant' })
  }

  if (![0, 1, 2, 3, 4].includes(Number(statut))) {
    return res.status(400).json({ error: 'Statut invalide' })
  }

  // Mettre à jour le statut
  const { data, error } = await supabase
    .from('livraisons')
    .update({
      statut: Number(statut),
      updated_at: new Date().toISOString()
    })
    .eq('code', code)
    .select('*, vendeurs(phone, nom_boutique)')
    .single()

  if (error || !data) {
    return res.status(500).json({ error: 'Erreur mise à jour', detail: error?.message })
  }

  // ── Notifications WhatsApp selon le statut ──────────────

  const appUrl = process.env.APP_URL || 'https://flivo.vercel.app'
  const lienClient = `${appUrl}/track.html?code=${code}`

  // Statut 2 → En route : notifier le client
  if (Number(statut) === 2) {
    const msg = `🛵 *${data.livreur_nom}* est en route vers vous !

Commande *#${code}*
Suivez en direct 👇
${lienClient}`
    sendWhatsApp(data.client_phone, msg)
  }

  // Statut 3 → Livré : notifier le vendeur
  if (Number(statut) === 3) {
    const vendeurPhone = data.vendeurs?.phone
    if (vendeurPhone) {
      const msg = `✅ Livraison *#${code}* effectuée !

👤 Client : ${data.client_nom}
💵 Montant encaissé : ${Number(data.montant).toLocaleString('fr-FR')} FCFA
🛵 Livreur : ${data.livreur_nom}

Voir sur Flivo 👇
${appUrl}/dashboard.html`
      sendWhatsApp(vendeurPhone, msg)
    }

    // Notifier le client aussi
    const msgClient = `✅ Votre commande *#${code}* a été livrée !

Merci d'avoir utilisé ${data.boutique_nom || 'notre service'} 🙏`
    sendWhatsApp(data.client_phone, msgClient)
  }

  // Statut 4 → Échec : notifier le vendeur
  if (Number(statut) === 4) {
    const vendeurPhone = data.vendeurs?.phone
    if (vendeurPhone) {
      const msg = `❌ Échec de livraison *#${code}*

👤 Client : ${data.client_nom}
📍 Adresse : ${data.adresse}
🛵 Livreur : ${data.livreur_nom}

Prends contact avec le client pour reprogrammer.`
      sendWhatsApp(vendeurPhone, msg)
    }
  }

  return res.status(200).json({ success: true, livraison: data })
}
