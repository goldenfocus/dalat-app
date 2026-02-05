-- RSVP Questionnaire System
-- Allows organizers to add custom questions that attendees must answer when RSVP'ing

-- ============================================
-- 1. QUESTION TEMPLATES (Pre-built + Custom)
-- ============================================

CREATE TABLE question_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  is_system BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multi_choice', 'text')),
  question_text JSONB NOT NULL,  -- Multilingual: {"en": "...", "vi": "..."}
  description_text JSONB,        -- Optional help text
  options JSONB,                 -- For choice questions: [{"value": "veg", "label": {"en": "Vegetarian", "vi": "Chay"}}]
  is_required BOOLEAN DEFAULT false,
  category TEXT CHECK (category IN ('logistics', 'dietary', 'contribution', 'personal', 'custom')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_question_templates_category ON question_templates(category);
CREATE INDEX idx_question_templates_is_system ON question_templates(is_system);

-- ============================================
-- 2. EVENT QUESTIONNAIRES
-- ============================================

CREATE TABLE event_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_enabled BOOLEAN DEFAULT true,
  intro_text JSONB,  -- Welcome message: {"en": "Help us plan...", "vi": "..."}
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_event_questionnaires_event ON event_questionnaires(event_id);

-- ============================================
-- 3. EVENT QUESTIONS (Links templates or custom)
-- ============================================

CREATE TABLE event_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID REFERENCES event_questionnaires(id) ON DELETE CASCADE NOT NULL,
  template_id UUID REFERENCES question_templates(id) ON DELETE SET NULL,
  -- Custom overrides (used if template_id is null OR to override template)
  custom_question_text JSONB,
  custom_question_type TEXT CHECK (custom_question_type IN ('single_choice', 'multi_choice', 'text')),
  custom_options JSONB,
  custom_is_required BOOLEAN,
  custom_description_text JSONB,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_event_questions_questionnaire ON event_questions(questionnaire_id);
CREATE INDEX idx_event_questions_template ON event_questions(template_id);

-- ============================================
-- 4. RSVP RESPONSES
-- ============================================

CREATE TABLE rsvp_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rsvp_id UUID REFERENCES rsvps(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES event_questions(id) ON DELETE CASCADE NOT NULL,
  response_value JSONB NOT NULL,  -- String for text, array for multi_choice, string for single_choice
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rsvp_id, question_id)
);

CREATE INDEX idx_rsvp_responses_rsvp ON rsvp_responses(rsvp_id);
CREATE INDEX idx_rsvp_responses_question ON rsvp_responses(question_id);

-- ============================================
-- 5. RLS POLICIES
-- ============================================

ALTER TABLE question_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_responses ENABLE ROW LEVEL SECURITY;

-- Question Templates: Anyone can read system templates
CREATE POLICY "templates_read_system" ON question_templates FOR SELECT
USING (is_system = true);

-- Question Templates: Users can read their own custom templates
CREATE POLICY "templates_read_own" ON question_templates FOR SELECT
USING (created_by = auth.uid());

-- Event Questionnaires: Anyone can read for published events
CREATE POLICY "questionnaires_read_published" ON event_questionnaires FOR SELECT
USING (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_id AND e.status = 'published'
));

-- Event Questionnaires: Event creators can manage their questionnaires
CREATE POLICY "questionnaires_insert_owner" ON event_questionnaires FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_id AND e.created_by = auth.uid()
));

CREATE POLICY "questionnaires_update_owner" ON event_questionnaires FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_id AND e.created_by = auth.uid()
));

CREATE POLICY "questionnaires_delete_owner" ON event_questionnaires FOR DELETE
USING (EXISTS (
  SELECT 1 FROM events e
  WHERE e.id = event_id AND e.created_by = auth.uid()
));

-- Event Questions: Anyone can read questions for published events
CREATE POLICY "questions_read_published" ON event_questions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM event_questionnaires eq
  JOIN events e ON e.id = eq.event_id
  WHERE eq.id = questionnaire_id AND e.status = 'published'
));

-- Event Questions: Event creators can manage questions
CREATE POLICY "questions_insert_owner" ON event_questions FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM event_questionnaires eq
  JOIN events e ON e.id = eq.event_id
  WHERE eq.id = questionnaire_id AND e.created_by = auth.uid()
));

CREATE POLICY "questions_update_owner" ON event_questions FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM event_questionnaires eq
  JOIN events e ON e.id = eq.event_id
  WHERE eq.id = questionnaire_id AND e.created_by = auth.uid()
));

CREATE POLICY "questions_delete_owner" ON event_questions FOR DELETE
USING (EXISTS (
  SELECT 1 FROM event_questionnaires eq
  JOIN events e ON e.id = eq.event_id
  WHERE eq.id = questionnaire_id AND e.created_by = auth.uid()
));

-- RSVP Responses: Users can manage their own responses
CREATE POLICY "responses_select_own" ON rsvp_responses FOR SELECT
USING (EXISTS (
  SELECT 1 FROM rsvps r
  WHERE r.id = rsvp_id AND r.user_id = auth.uid()
));

CREATE POLICY "responses_insert_own" ON rsvp_responses FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM rsvps r
  WHERE r.id = rsvp_id AND r.user_id = auth.uid()
));

CREATE POLICY "responses_update_own" ON rsvp_responses FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM rsvps r
  WHERE r.id = rsvp_id AND r.user_id = auth.uid()
));

-- RSVP Responses: Event creators can view all responses for their events
CREATE POLICY "responses_select_owner" ON rsvp_responses FOR SELECT
USING (EXISTS (
  SELECT 1 FROM event_questions eq
  JOIN event_questionnaires eqn ON eqn.id = eq.questionnaire_id
  JOIN events e ON e.id = eqn.event_id
  WHERE eq.id = question_id AND e.created_by = auth.uid()
));

-- ============================================
-- 6. SYSTEM TEMPLATES (Pre-built questions)
-- ============================================

INSERT INTO question_templates (slug, is_system, question_type, question_text, options, is_required, category) VALUES

-- LOGISTICS: Overnight stay
('overnight-stay', true, 'single_choice',
 '{"en": "Will you be staying overnight?", "vi": "Bạn có ở lại qua đêm không?", "ko": "숙박하실 건가요?", "zh": "您会过夜吗?", "ru": "Вы останетесь на ночь?", "fr": "Allez-vous passer la nuit?", "ja": "宿泊されますか?", "ms": "Adakah anda akan bermalam?", "th": "คุณจะพักค้างคืนไหม?", "de": "Werden Sie übernachten?", "es": "¿Se quedará a pasar la noche?", "id": "Apakah Anda akan menginap?"}'::jsonb,
 '[{"value": "yes", "label": {"en": "Yes, staying overnight", "vi": "Có, ở lại qua đêm", "ko": "예, 숙박합니다", "zh": "是，过夜", "ru": "Да, останусь на ночь", "fr": "Oui, je reste la nuit", "ja": "はい、宿泊します", "ms": "Ya, bermalam", "th": "ใช่ พักค้างคืน", "de": "Ja, ich übernachte", "es": "Sí, me quedo a dormir", "id": "Ya, menginap"}},
   {"value": "no", "label": {"en": "No, day trip only", "vi": "Không, chỉ đi trong ngày", "ko": "아니요, 당일치기", "zh": "不，只是一日游", "ru": "Нет, только на день", "fr": "Non, juste la journée", "ja": "いいえ、日帰りです", "ms": "Tidak, lawatan sehari sahaja", "th": "ไม่ ไปเช้าเย็นกลับ", "de": "Nein, nur Tagesausflug", "es": "No, solo un día", "id": "Tidak, hanya sehari"}}]'::jsonb,
 true, 'logistics'),

-- LOGISTICS: Gender (for room arrangement)
('gender', true, 'single_choice',
 '{"en": "Your gender (for room arrangement)", "vi": "Giới tính của bạn (để sắp xếp phòng)", "ko": "성별 (객실 배정용)", "zh": "您的性别（用于房间安排）", "ru": "Ваш пол (для размещения по комнатам)", "fr": "Votre genre (pour arrangement des chambres)", "ja": "性別（部屋の割り当て用）", "ms": "Jantina anda (untuk aturan bilik)", "th": "เพศของคุณ (สำหรับจัดห้องพัก)", "de": "Ihr Geschlecht (für Zimmereinteilung)", "es": "Su género (para asignar habitaciones)", "id": "Gender Anda (untuk pengaturan kamar)"}'::jsonb,
 '[{"value": "male", "label": {"en": "He/Him", "vi": "Nam", "ko": "남성", "zh": "男", "ru": "Мужской", "fr": "Homme", "ja": "男性", "ms": "Lelaki", "th": "ชาย", "de": "Männlich", "es": "Masculino", "id": "Laki-laki"}},
   {"value": "female", "label": {"en": "She/Her", "vi": "Nữ", "ko": "여성", "zh": "女", "ru": "Женский", "fr": "Femme", "ja": "女性", "ms": "Perempuan", "th": "หญิง", "de": "Weiblich", "es": "Femenino", "id": "Perempuan"}},
   {"value": "other", "label": {"en": "They/Them", "vi": "Khác", "ko": "기타", "zh": "其他", "ru": "Другой", "fr": "Autre", "ja": "その他", "ms": "Lain-lain", "th": "อื่นๆ", "de": "Andere", "es": "Otro", "id": "Lainnya"}}]'::jsonb,
 true, 'logistics'),

-- DIETARY: Dietary preference
('dietary', true, 'single_choice',
 '{"en": "Dietary preference", "vi": "Chế độ ăn", "ko": "식이 요법", "zh": "饮食偏好", "ru": "Диетические предпочтения", "fr": "Préférence alimentaire", "ja": "食事の好み", "ms": "Pilihan diet", "th": "ความต้องการอาหาร", "de": "Ernährungspräferenz", "es": "Preferencia dietética", "id": "Preferensi diet"}'::jsonb,
 '[{"value": "none", "label": {"en": "No restrictions", "vi": "Không kiêng gì", "ko": "제한 없음", "zh": "无限制", "ru": "Без ограничений", "fr": "Aucune restriction", "ja": "制限なし", "ms": "Tiada sekatan", "th": "ไม่มีข้อจำกัด", "de": "Keine Einschränkungen", "es": "Sin restricciones", "id": "Tidak ada batasan"}},
   {"value": "vegetarian", "label": {"en": "Vegetarian", "vi": "Ăn chay", "ko": "채식", "zh": "素食", "ru": "Вегетарианец", "fr": "Végétarien", "ja": "ベジタリアン", "ms": "Vegetarian", "th": "มังสวิรัติ", "de": "Vegetarisch", "es": "Vegetariano", "id": "Vegetarian"}},
   {"value": "vegan", "label": {"en": "Vegan", "vi": "Thuần chay", "ko": "비건", "zh": "纯素", "ru": "Веган", "fr": "Végan", "ja": "ビーガン", "ms": "Vegan", "th": "วีแกน", "de": "Vegan", "es": "Vegano", "id": "Vegan"}},
   {"value": "halal", "label": {"en": "Halal", "vi": "Halal", "ko": "할랄", "zh": "清真", "ru": "Халяль", "fr": "Halal", "ja": "ハラール", "ms": "Halal", "th": "ฮาลาล", "de": "Halal", "es": "Halal", "id": "Halal"}}]'::jsonb,
 true, 'dietary'),

-- DIETARY: Allergies (text)
('allergies', true, 'text',
 '{"en": "Any food allergies? (leave blank if none)", "vi": "Bạn có dị ứng thực phẩm nào không? (bỏ trống nếu không có)", "ko": "음식 알레르기가 있나요? (없으면 비워두세요)", "zh": "有食物过敏吗？（没有请留空）", "ru": "Есть ли пищевая аллергия? (оставьте пустым, если нет)", "fr": "Des allergies alimentaires? (laissez vide si aucune)", "ja": "食物アレルギーはありますか？（なければ空欄で）", "ms": "Ada alahan makanan? (kosongkan jika tiada)", "th": "มีอาการแพ้อาหารไหม? (เว้นว่างถ้าไม่มี)", "de": "Lebensmittelallergien? (leer lassen wenn keine)", "es": "¿Alergias alimentarias? (dejar en blanco si ninguna)", "id": "Ada alergi makanan? (kosongkan jika tidak ada)"}'::jsonb,
 NULL,
 false, 'dietary'),

-- CONTRIBUTION: How would you like to contribute?
('contribution', true, 'multi_choice',
 '{"en": "How would you like to contribute?", "vi": "Bạn muốn đóng góp gì?", "ko": "어떻게 기여하고 싶으신가요?", "zh": "您想如何贡献？", "ru": "Как бы вы хотели помочь?", "fr": "Comment souhaitez-vous contribuer?", "ja": "どのように貢献されますか？", "ms": "Bagaimana anda ingin menyumbang?", "th": "คุณอยากมีส่วนร่วมอย่างไร?", "de": "Wie möchten Sie beitragen?", "es": "¿Cómo le gustaría contribuir?", "id": "Bagaimana Anda ingin berkontribusi?"}'::jsonb,
 '[{"value": "helping", "label": {"en": "Helping hands (setup/during)", "vi": "Giúp việc (trước/trong sự kiện)", "ko": "도움 (준비/진행)", "zh": "帮手（布置/期间）", "ru": "Помощь (подготовка/во время)", "fr": "Coup de main (installation/pendant)", "ja": "お手伝い（準備/当日）", "ms": "Bantuan (persediaan/semasa)", "th": "ช่วยงาน (จัดเตรียม/ระหว่างงาน)", "de": "Helfen (Aufbau/während)", "es": "Ayudar (montaje/durante)", "id": "Membantu (persiapan/selama acara)"}},
   {"value": "talent", "label": {"en": "Share talent (games, music)", "vi": "Chia sẻ tài năng (trò chơi, âm nhạc)", "ko": "재능 공유 (게임, 음악)", "zh": "分享才艺（游戏、音乐）", "ru": "Поделиться талантом (игры, музыка)", "fr": "Partager un talent (jeux, musique)", "ja": "特技を披露（ゲーム、音楽）", "ms": "Kongsi bakat (permainan, muzik)", "th": "แบ่งปันความสามารถ (เกม, ดนตรี)", "de": "Talent teilen (Spiele, Musik)", "es": "Compartir talento (juegos, música)", "id": "Berbagi bakat (permainan, musik)"}},
   {"value": "financial", "label": {"en": "Financial support", "vi": "Hỗ trợ tài chính", "ko": "재정 지원", "zh": "财务支持", "ru": "Финансовая помощь", "fr": "Soutien financier", "ja": "資金援助", "ms": "Sokongan kewangan", "th": "สนับสนุนทางการเงิน", "de": "Finanzielle Unterstützung", "es": "Apoyo financiero", "id": "Dukungan finansial"}},
   {"value": "prizes", "label": {"en": "Bring prizes/gifts", "vi": "Mang quà/giải thưởng", "ko": "상품/선물 가져오기", "zh": "带奖品/礼物", "ru": "Принести призы/подарки", "fr": "Apporter des prix/cadeaux", "ja": "景品/ギフトを持参", "ms": "Bawa hadiah/cenderahati", "th": "นำของรางวัล/ของขวัญ", "de": "Preise/Geschenke mitbringen", "es": "Traer premios/regalos", "id": "Membawa hadiah/kado"}},
   {"value": "vibes", "label": {"en": "Just good energy!", "vi": "Chỉ mang năng lượng tích cực!", "ko": "긍정 에너지만!", "zh": "只带好心情！", "ru": "Только позитив!", "fr": "Juste de la bonne énergie!", "ja": "元気を持っていきます！", "ms": "Hanya tenaga positif!", "th": "แค่พลังงานดีๆ!", "de": "Nur gute Energie!", "es": "¡Solo buena energía!", "id": "Hanya energi positif!"}}]'::jsonb,
 false, 'contribution'),

-- PERSONAL: Dress code for Tết
('dress-code-tet', true, 'single_choice',
 '{"en": "What will you wear?", "vi": "Bạn sẽ mặc gì?", "ko": "무엇을 입으시겠어요?", "zh": "您会穿什么？", "ru": "Что наденете?", "fr": "Que porterez-vous?", "ja": "何を着ますか？", "ms": "Apa yang akan anda pakai?", "th": "คุณจะสวมใส่อะไร?", "de": "Was werden Sie tragen?", "es": "¿Qué llevará puesto?", "id": "Apa yang akan Anda kenakan?"}'::jsonb,
 '[{"value": "ao-dai", "label": {"en": "Áo dài", "vi": "Áo dài", "ko": "아오자이", "zh": "奥黛", "ru": "Ао зай", "fr": "Áo dài", "ja": "アオザイ", "ms": "Áo dài", "th": "อ่าวหญ่าย", "de": "Áo dài", "es": "Áo dài", "id": "Áo dài"}},
   {"value": "ao-ba-ba", "label": {"en": "Áo bà ba", "vi": "Áo bà ba", "ko": "아오바바", "zh": "奥巴巴", "ru": "Ао ба ба", "fr": "Áo bà ba", "ja": "アオバーバー", "ms": "Áo bà ba", "th": "อ่าวบ่าบ่า", "de": "Áo bà ba", "es": "Áo bà ba", "id": "Áo bà ba"}},
   {"value": "vietnam-flag", "label": {"en": "Vietnam flag T-shirt", "vi": "Áo cờ Việt Nam", "ko": "베트남 국기 티셔츠", "zh": "越南国旗T恤", "ru": "Футболка с флагом Вьетнама", "fr": "T-shirt drapeau Vietnam", "ja": "ベトナム国旗Tシャツ", "ms": "Baju bendera Vietnam", "th": "เสื้อธงเวียดนาม", "de": "Vietnam-Flagge T-Shirt", "es": "Camiseta bandera de Vietnam", "id": "Kaos bendera Vietnam"}},
   {"value": "casual", "label": {"en": "Casual", "vi": "Thoải mái", "ko": "캐주얼", "zh": "休闲", "ru": "Повседневный", "fr": "Décontracté", "ja": "カジュアル", "ms": "Kasual", "th": "ลำลอง", "de": "Casual", "es": "Casual", "id": "Kasual"}}]'::jsonb,
 false, 'personal');

-- ============================================
-- 7. HELPER FUNCTIONS
-- ============================================

-- Get questionnaire with questions for an event
CREATE OR REPLACE FUNCTION get_event_questionnaire(p_event_id UUID)
RETURNS TABLE (
  questionnaire_id UUID,
  is_enabled BOOLEAN,
  intro_text JSONB,
  questions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    eq.id as questionnaire_id,
    eq.is_enabled,
    eq.intro_text,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', eqs.id,
          'template_id', eqs.template_id,
          'sort_order', eqs.sort_order,
          'question_type', COALESCE(eqs.custom_question_type, qt.question_type),
          'question_text', COALESCE(eqs.custom_question_text, qt.question_text),
          'description_text', COALESCE(eqs.custom_description_text, qt.description_text),
          'options', COALESCE(eqs.custom_options, qt.options),
          'is_required', COALESCE(eqs.custom_is_required, qt.is_required)
        ) ORDER BY eqs.sort_order
      ) FILTER (WHERE eqs.id IS NOT NULL),
      '[]'::jsonb
    ) as questions
  FROM event_questionnaires eq
  LEFT JOIN event_questions eqs ON eqs.questionnaire_id = eq.id
  LEFT JOIN question_templates qt ON qt.id = eqs.template_id
  WHERE eq.event_id = p_event_id
  GROUP BY eq.id, eq.is_enabled, eq.intro_text;
END;
$$;

-- Get questionnaire responses summary for organizer dashboard
CREATE OR REPLACE FUNCTION get_questionnaire_responses_summary(p_event_id UUID)
RETURNS TABLE (
  question_id UUID,
  question_text JSONB,
  question_type TEXT,
  total_responses BIGINT,
  response_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is the event owner
  IF NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id AND e.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    eqs.id as question_id,
    COALESCE(eqs.custom_question_text, qt.question_text) as question_text,
    COALESCE(eqs.custom_question_type, qt.question_type) as question_type,
    COUNT(rr.id) as total_responses,
    COALESCE(
      jsonb_object_agg(
        rr.response_value::text,
        cnt
      ) FILTER (WHERE rr.response_value IS NOT NULL),
      '{}'::jsonb
    ) as response_breakdown
  FROM event_questionnaires eq
  JOIN event_questions eqs ON eqs.questionnaire_id = eq.id
  LEFT JOIN question_templates qt ON qt.id = eqs.template_id
  LEFT JOIN rsvp_responses rr ON rr.question_id = eqs.id
  LEFT JOIN rsvps r ON r.id = rr.rsvp_id AND r.status = 'going'
  LEFT JOIN (
    SELECT question_id, response_value, COUNT(*) as cnt
    FROM rsvp_responses rr2
    JOIN rsvps r2 ON r2.id = rr2.rsvp_id AND r2.status = 'going'
    GROUP BY question_id, response_value
  ) breakdown ON breakdown.question_id = eqs.id
  WHERE eq.event_id = p_event_id
  GROUP BY eqs.id, qt.question_text, qt.question_type, eqs.custom_question_text, eqs.custom_question_type
  ORDER BY eqs.sort_order;
END;
$$;

-- Get all responses for an event (for CSV export)
CREATE OR REPLACE FUNCTION get_questionnaire_responses_full(p_event_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  username TEXT,
  avatar_url TEXT,
  rsvp_status TEXT,
  rsvp_created_at TIMESTAMPTZ,
  responses JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is the event owner
  IF NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.id = p_event_id AND e.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id as user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    r.status as rsvp_status,
    r.created_at as rsvp_created_at,
    COALESCE(
      jsonb_object_agg(
        eqs.id::text,
        rr.response_value
      ) FILTER (WHERE rr.id IS NOT NULL),
      '{}'::jsonb
    ) as responses
  FROM rsvps r
  JOIN profiles p ON p.id = r.user_id
  LEFT JOIN event_questionnaires eq ON eq.event_id = r.event_id
  LEFT JOIN event_questions eqs ON eqs.questionnaire_id = eq.id
  LEFT JOIN rsvp_responses rr ON rr.rsvp_id = r.id AND rr.question_id = eqs.id
  WHERE r.event_id = p_event_id
    AND r.status IN ('going', 'waitlist')
  GROUP BY p.id, p.display_name, p.username, p.avatar_url, r.status, r.created_at
  ORDER BY r.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_event_questionnaire(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_questionnaire_responses_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_questionnaire_responses_full(UUID) TO authenticated;
