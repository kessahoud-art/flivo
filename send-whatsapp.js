// ─────────────────────────────────────────────────────────
//  Flivo — send-whatsapp.js
//  Envoie un message WhatsApp via CallMeBot API (gratuit)
//
//  SETUP OBLIGATOIRE (1 fois par numéro) :
//  1. Envoie ce message depuis le numéro destinataire :
//     "I allow callmebot to send me messages"
//     au numéro WhatsApp : +34 644 59 85 90
//  2. Tu recevras une réponse avec ton API key
//  3. Mets cette clé dans CALLMEBOT_API_KEY sur Vercel
// ─────────────────────────────────────────────────────────

module.exports = async function sendWhatsApp(phone, message) {
  const apiKey = process.env.CALLMEBOT_API_KEY
  if (!apiKey) {
    console.warn('CALLMEBOT_API_KEY manquant — WhatsApp désactivé')
    return { success: false, reason: 'no_key' }
  }

  // Nettoyer le numéro : garder uniquement les chiffres
  const cleanPhone = String(phone).replace(/\D/g, '')

  const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`

  try {
    const res = await fetch(url)
    const text = await res.text()
    console.log(`WhatsApp → ${cleanPhone} : ${text}`)
    return { success: true }
  } catch (err) {
    console.error('Erreur WhatsApp :', err.message)
    return { success: false, reason: err.message }
  }
}
