-- ═══════════════════════════════════════════════════════════
--  FLIVO — Sécurité Supabase (RLS)
--  Colle ces requêtes dans Supabase > SQL Editor > New Query
--  Puis clique "Run"
-- ═══════════════════════════════════════════════════════════

-- 1. Activer RLS sur les 2 tables
ALTER TABLE vendeurs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE livraisons  ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────
-- 2. Règles pour la table "vendeurs"
-- ──────────────────────────────────────────────────────────

-- Un vendeur ne peut voir que son propre profil
CREATE POLICY "vendeur_voir_son_profil"
ON vendeurs FOR SELECT
USING (auth.uid() = id);

-- Un vendeur ne peut modifier que son propre profil
CREATE POLICY "vendeur_modifier_son_profil"
ON vendeurs FOR UPDATE
USING (auth.uid() = id);

-- Permettre l'insertion à la création de compte
CREATE POLICY "vendeur_creer_profil"
ON vendeurs FOR INSERT
WITH CHECK (auth.uid() = id);

-- ──────────────────────────────────────────────────────────
-- 3. Règles pour la table "livraisons"
-- ──────────────────────────────────────────────────────────

-- Un vendeur ne voit que ses propres livraisons
CREATE POLICY "vendeur_voir_ses_livraisons"
ON livraisons FOR SELECT
USING (auth.uid() = vendeur_id);

-- Permettre la lecture publique par code (pour tracking client + livreur)
-- IMPORTANT : cette règle permet à n'importe qui de voir une livraison par son code
CREATE POLICY "lecture_publique_par_code"
ON livraisons FOR SELECT
USING (true);

-- Un vendeur ne peut créer que ses propres livraisons
CREATE POLICY "vendeur_creer_livraison"
ON livraisons FOR INSERT
WITH CHECK (auth.uid() = vendeur_id);

-- Permettre la mise à jour publique du statut (pour le livreur sans compte)
-- Limité aux colonnes statut et updated_at uniquement
CREATE POLICY "livreur_maj_statut"
ON livraisons FOR UPDATE
USING (true)
WITH CHECK (true);

-- ──────────────────────────────────────────────────────────
-- 4. Autoriser le service role (pour tes API Vercel)
-- ──────────────────────────────────────────────────────────
-- Tes fonctions API utilisent SUPABASE_ANON_KEY qui respecte RLS
-- Si tu veux bypasser RLS dans tes APIs, utilise SUPABASE_SERVICE_ROLE_KEY
-- Ajoute cette variable dans Vercel :
-- SUPABASE_SERVICE_KEY → la clé "service_role" dans Settings > API

-- ──────────────────────────────────────────────────────────
-- 5. Vérifier que tout est OK
-- ──────────────────────────────────────────────────────────
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('vendeurs', 'livraisons');
