package main

import (
	"strings"
	"testing"
	"time"
)

// Fixtures are the source_metadata.source_text_evidence values of the
// WhatsApp drafts Dalat Review rejected for 4–12 Nov 2026.

const fixtureFoodDrinks = `🍊 Wander around the farm and enjoy a relaxed Sunday afternoon together, sharing conversations, laughter, and good moments with old and new friends. As the sun goes down, we'll gather around a little campfire from 6 PM for music, singing, and a cosy evening together. 🔥🎶

🍊 Food & Drinks

🐶🐱 A little heads-up: some dogs and a cat living at the farm. Puppies will soon rehome, come to pet them before they leave!

💚 Contribution: 60,000 VND per person to help cover food, drinks, and preparation.

🗓️ Time: Sunday, 15th Nov | 4–7 PM

📍 Nông trại của mẹ
https://maps.app.goo.gl/HZ6Rtsqe6v1ofxKh8

Please note that the ramp leading down to the house is quite steep. You can park your motorbike at the entrance to the ramp and walk down from there. 😊

Looking forward to another lovely Sunday afternoon with you all! 💚`

const fixtureDanceTalk = `DANCE TALK – MORE THAN DANCE, IT’S AN EXPERIENCE.

Imagine dancing in a beautiful castle-like venue, surrounded by stunning architecture, unique antiques, art and timeless décor… while exploring movement, music, connection and self-expression.

This Sunday, join us for DANCE TALK: a unique, two-hour immersive experience combining Ecstatic Dance and Contact Improvisation.

This is more than a dance workshop. It's an opportunity to step away from everyday life, explore something new, connect with others and discover what movement can open up within you.

NO EXPERIENCE NEEDED. NO PARTNER NEEDED. NO PRESSURE.

Whether you're a complete beginner, an occasional dancer or someone with years of experience, everyone is welcome. We'll guide you step by step, giving you the freedom to explore at your own pace.

WHAT WILL WE EXPERIENCE?

1. ECSTATIC DANCE – EXPLORE & EXPRESS (45 MIN)

Discover the freedom of moving without choreography or expectations. Through guided exercises, music and different movement qualities, we'll explore creativity, body awareness, playfulness and self-expression.

2. OPEN-FLOW ECSTATIC DANCE JAM (15 MIN)

An opportunity to let go, move freely and put what you've explored into practice. Follow the music, trust your body and enjoy the moment.

3. CONTACT IMPROVISATION – CONNECTION & EXPLORATION (45 MIN)

Explore the art of connecting through movement with fun, guided partner and group exercises. Discover trust, communication, listening, balance, shared movement and the beauty of creating together.

4. OPEN CONTACT IMPROVISATION JAM (15 MIN)

Bring everything together in an open movement space where you can experiment, connect and play.

All touch and weight-sharing are optional. You choose your own boundaries and what feels comfortable.

🏰 THE VENUE – PART OF THE EXPERIENCE!

We're bringing this experience to Indochinois House, a truly special, castle-like venue in Da Lat.

Imagine dancing surrounded by beautiful interiors, fascinating antiques, artistic details and an atmosphere that feels like stepping into another world.

We want this to be an experience that engages all your senses — the music you hear, the movements you feel, the people you connect with and the beautiful surroundings you get to enjoy.

And to make the evening even more special, one complimentary drink is included in your ticket! 🥂

WHY JOIN US?
✨ Explore a different way of expressing yourself.
✨ Build confidence and become more comfortable being seen.
✨ Let go of expectations and self-consciousness.
✨ Discover new ways to move and connect.
✨ Explore trust, communication and connection.
✨ Meet new people in a fun, welcoming environment.
✨ Give yourself permission to play, experiment and discover.

📍 EVENT DETAILS
📅 Sunday, 15 November 2026
⏰ 19:00–21:00 (2 hours)
📍 Indochinois House, 81 An Binh, Da Lat
https://maps.app.goo.gl/ehGi85BDeJiRvFx87
💰 500,000 VND per person
🥂 Includes one complimentary drink

🎟️ HOW TO BOOK
Message DALATEXPERIENCES on Facebook
https://www.facebook.com/share/1CcTZevejX/
or Instagram to reserve your place
https://www.instagram.com/dalatexperiences?dlrf=MTZpanJ3cGlna3RpMQ==

Full payment is required in advance to confirm your booking. The workshop will be confirmed once the minimum number of bookings is reached by 14:00 on Sunday, 15 November. If the minimum is not reached, you'll receive a full refund.

Spaces are limited, so don't wait too long to secure yours!

Come with curiosity. Come ready to explore. Come exactly as you are.

Move. Explore. Connect. Discover.

We can't wait to share this special experience with you! ❤️`

const fixturePaintWorkshop = "\u200bAs part of my month-long Open Studio BRIGHT WATER, I warmly invite you to join me for a special collaborative workshop: Paint With BRIGHT WATER! \U0001F3A8✨\n\n\u200bThroughout the entire exhibition, the canvas remains open: you are free to drop in and paint directly onto my artwork anytime using my handmade oil sticks, completely free of charge. \U0001F58C️\U0001F33F However, during this hands-on workshop, we’ll take the experience a step deeper.\n\n\u200bI’ll share the story behind the collection, demonstrate how I formulate and craft my custom oil sticks, and paint right alongside you. You'll also receive personalized guidance and tips to nourish your own artistic journey. \U0001F469\u200d\U0001F3A8📜\n\n📍 Location: Loisongdep, 71 Hùng Vương, Đà Lạt\n🗓️ Date: Sat 14 Dec, 2026\n⏰ Time: 2 pm to 4 pm\n🧧 Fee: 20 USD/person (20% off for LiD members)\n\nDetails here: https://www.facebook.com/share/1HncP1adB8/\n\n\u200bNằm trong sự kiện Mở Xưởng HÀ MINH kéo dài một tháng, mình xin gửi lời mời ấm áp nhất đến bạn tham gia buổi workshop vẽ tranh đặc biệt: Vẽ Cùng HÀ MINH! \U0001F3A8✨\n\n\u200bTrong suốt thời gian triển lãm, không gian sáng tác luôn rộng mở: bạn có thể ghé thăm và tự do vẽ trực tiếp lên các tác phẩm bất cứ lúc nào bằng sơn dầu thỏi thủ công hoàn toàn miễn phí. \U0001F58C️\U0001F33F Tuy nhiên, buổi workshop này sẽ mang đến một trải nghiệm sâu sắc và trọn vẹn hơn.\n\n\u200bTại đây, mình sẽ chia sẻ về câu chuyện đằng sau bộ tác phẩm, quy trình tự chế tác các thỏi sơn dầu, đồng thời cùng vẽ và đồng hành để gửi đến bạn những gợi ý riêng cho hành trình sáng tạo của bản thân. \U0001F469\u200d\U0001F3A8📜\n\n📍 Địa điểm: Loisongdep, 71 Hùng Vương, Đà Lạt\n🗓️ Ngày tổ chức: Thứ 7, ngày 14 tháng 11, 2026\n⏰ Thời gian: 2h chiều đến 4h chiều\n🧧 Chi phí: 500.000 VND/người (giảm 20% cho thành viên LiD)\n\nXem thông tin chi tiết tại đây: https://www.facebook.com/share/1HncP1adB8/"

const fixtureOpenStudioSpot = `We still have one spot left for the free trial workshop tomorrow at 2:00. 😇😚`

const fixtureLostNotebook = `Hi everyone! 👋
Thank you all for coming tonight, it was such a great evening! 🙌
Also, someone left a notebook at Socialhouse. If it's yours, just message me and you can pick it up anytime.
Best Wishes and good night`

const fixtureHavenJazz = `Hey guys!

Tonight we have cá tre playing at Haven Jazz.

Great bunch of guys who are playing at the jazz festival tomorrow night.

Come down from 7-9pm to check out some grass roots Vietnamese Jazz Pop!`

const fixtureJournal = `Hi everyone! Is anyone in our community into art journaling, fun journaling, or any kind of writing?
I often casually gather with friends at a cafe to chat and work on our journals or writing together. I’m planning to have a cozy day like that tomorrow at Bản cà phê Đà Lạt. Anyone interested in joining me? ^^ I usually spend hours doing this—it's so relaxing and fun, so I’ll basically be hanging out at the cafe all day. Feel free to drop by whenever you like and find me nha! Here is the location: https://maps.app.goo.gl/RBtshSv1UgE9ABQJA`

func decideCase(t *testing.T, id, text string, sent time.Time, hasImage bool) (*eventDraft, error) {
	t.Helper()
	in := inbound{
		ID: id, GroupJID: "120363@g.us", GroupName: "Events & Offers",
		Sender: "review-case", Text: text, Timestamp: sent,
	}
	if hasImage {
		in.HasImage = true
		in.Image = testFlyerPNG(t)
		in.ImageMIME = "image/png"
	}
	return decide(in, nil, nil, sent)
}

func TestSectionHeadersAreLabelsNotValues(t *testing.T) {
	for _, line := range []string{"Food & Drinks", "🍊 Food & Drinks", "📍 EVENT DETAILS", "Event Details:", "Schedule", "Agenda", "Location", "When", "Where", "Details", "Tickets"} {
		if !isSectionHeader(line) && !isLabelLine(line) {
			t.Errorf("want header/label: %q", line)
		}
		if got := chooseTitle(line+"\nSunday 15 Nov 4pm", "", "", false); isSectionHeader(got) || strings.EqualFold(strings.TrimSpace(stripEmoji(got)), strings.TrimSpace(stripEmoji(line))) {
			t.Errorf("header used as title: line=%q title=%q", line, got)
		}
	}
	if isSectionHeader("Food & Drinks Festival") {
		t.Fatal("a longer title must not be treated as a header")
	}

	// wa-ac4753e5… used "Food & Drinks" as the title.
	sent := time.Date(2026, 11, 12, 18, 29, 15, 0, testLoc)
	d, err := decideCase(t, "AC4753E5B74859789D4753CDB0E19D3D", fixtureFoodDrinks, sent, true)
	if err != nil {
		t.Fatal(err)
	}
	if d.Title == "Food & Drinks" || isSectionHeader(d.Title) {
		t.Fatalf("title %q is a section header", d.Title)
	}

	// wa-acd8cc3f… used location_name "Event Details"; the venue is Indochinois House.
	sent = time.Date(2026, 11, 12, 18, 56, 4, 0, testLoc)
	d, err = decideCase(t, "ACD8CC3FECBF372669CB0978AAAB186D", fixtureDanceTalk, sent, true)
	if err != nil {
		t.Fatal(err)
	}
	if d.Location == "Event Details" || isSectionHeader(d.Location) {
		t.Fatalf("location %q is a section header", d.Location)
	}
	if !strings.Contains(strings.ToLower(d.Location), "indochinois") {
		t.Fatalf("want Indochinois House, got %q", d.Location)
	}
	if !strings.Contains(d.Address, "81") && !strings.Contains(d.Location, "81") {
		t.Fatalf("want 81 An Bình in venue/address, loc=%q addr=%q", d.Location, d.Address)
	}
}

func TestURLAndChatFragmentsRejectedOrTrimmed(t *testing.T) {
	if !isCTATitle("Details here: https://www.facebook.com/share/1HncP1adB8/") || !containsURL("Details here: https://www.facebook.com/share/1HncP1adB8/") {
		t.Fatal("facebook CTA should be rejected as a title")
	}
	sent := time.Date(2026, 11, 5, 3, 28, 11, 0, testLoc)
	d, err := decideCase(t, "ACCB62ECF1A661A26A37966B94AB6E81", fixturePaintWorkshop, sent, true)
	if err != nil {
		t.Fatal(err)
	}
	if containsURL(d.Title) || isCTATitle(d.Title) || strings.Contains(strings.ToLower(d.Title), "details here") {
		t.Fatalf("title is a URL/CTA fragment: %q", d.Title)
	}
	if !strings.Contains(strings.ToLower(d.Title), "bright water") && !strings.Contains(d.Title, "HÀ MINH") && !strings.Contains(strings.ToLower(d.Title), "paint") {
		t.Fatalf("want the workshop name from the text, got %q", d.Title)
	}

	// Venue must stop at a sentence / pronoun continuation.
	if got := venueFromText("someone left a notebook at Socialhouse. If it's yours, just message me").Name; got != "Socialhouse" {
		t.Fatalf("Socialhouse. If: got %q", got)
	}
	if got := venueFromText("Workshop at Open Studio. I'll send the details tonight.").Name; got != "Open Studio" {
		t.Fatalf("Open Studio. I'll: got %q", got)
	}
	if title := chooseTitle("Workshop at Open Studio. I'll send the details tonight.\nTomorrow 14:00", "", "", false); strings.Contains(title, "I'll") || containsURL(title) {
		t.Fatalf("title still has a chat continuation: %q", title)
	}
}

func TestPreferExplicitRangeAndDaytimeBareHour(t *testing.T) {
	sent := time.Date(2026, 11, 12, 18, 29, 15, 0, testLoc)
	d, err := decideCase(t, "AC4753E5B74859789D4753CDB0E19D3D", fixtureFoodDrinks, sent, true)
	if err != nil {
		t.Fatal(err)
	}
	start, end := d.StartsAt.In(testLoc), (*time.Time)(nil)
	if d.EndsAt != nil {
		e := d.EndsAt.In(testLoc)
		end = &e
	}
	if start.Day() != 15 || start.Month() != time.November || start.Hour() != 16 {
		t.Fatalf("want 15 Nov 16:00 ICT from 4–7 PM, got %s", start)
	}
	if end == nil || end.Hour() != 19 {
		t.Fatalf("want end 19:00 ICT from the range, got %v", end)
	}

	// "tomorrow at 2:00" posted 14:35 ICT 7 Nov → 14:00 ICT 8 Nov, not 02:00.
	c, ok := findClock("workshop tomorrow at 2:00")
	if !ok || c.hour != 14 || c.minute != 0 || c.ambiguous {
		t.Fatalf("bare 2:00 should default to 14:00, got %+v ok=%v", c, ok)
	}
	c, ok = findClock("meet at 8:00 in the hall")
	if !ok || !c.ambiguous {
		t.Fatalf("bare 8:00 without am/pm should be ambiguous, got %+v ok=%v", c, ok)
	}
}

func TestTonightResolvesAgainstSentTimestamp(t *testing.T) {
	// wa-3afae27f… posted 13:06 ICT 5 Nov; "tonight 7-9pm" is 5 Nov, not 6 Nov.
	sent := time.Date(2026, 11, 5, 13, 6, 13, 0, testLoc)
	d, err := decideCase(t, "3AFAE27F075FDFAC4A94", fixtureHavenJazz, sent, true)
	if err != nil {
		t.Fatal(err)
	}
	start := d.StartsAt.In(testLoc)
	if start.Year() != 2026 || start.Month() != time.November || start.Day() != 5 || start.Hour() != 19 {
		t.Fatalf("want 5 Nov 19:00 ICT, got %s", start)
	}
	if d.EndsAt == nil || d.EndsAt.In(testLoc).Hour() != 21 {
		t.Fatalf("want end 21:00 ICT, got %v", d.EndsAt)
	}
	if d.Title == "Festival at Haven Jazz" {
		t.Fatalf("invented title %q", d.Title)
	}
	if d.Meta["title_needs_review"] != true && !strings.HasPrefix(d.Title, "Event at ") {
		// A title taken from the text is fine; an invented "Festival at …" is not.
		if !strings.Contains(fixtureHavenJazz, d.Title) {
			t.Fatalf("title %q was not taken from the text and is not the placeholder", d.Title)
		}
	}
}

func TestSkipNonEventChatAndNeverInferMissingStart(t *testing.T) {
	journalAt := time.Date(2026, 11, 5, 17, 11, 5, 0, testLoc)
	if _, err := decideCase(t, "3EB07445E2903890A40080", fixtureJournal, journalAt, false); err == nil {
		t.Fatal("journal hangout with no time should be skipped")
	}
	spotAt := time.Date(2026, 11, 7, 14, 35, 58, 0, testLoc)
	if _, err := decideCase(t, "AC8EE7F9F9C7381809F6C3A53585994E", fixtureOpenStudioSpot, spotAt, true); err == nil {
		t.Fatal("one-spot-left reply should be skipped")
	}
	thanksAt := time.Date(2026, 11, 4, 22, 35, 45, 0, testLoc)
	if _, err := decideCase(t, "3ABBB3918B9E8C659314", fixtureLostNotebook, thanksAt, false); err == nil {
		t.Fatal("thank-you plus lost-notebook note should be skipped")
	}

	start, inferred, err := extractStartTime(fixtureLostNotebook, testLoc, thanksAt)
	if err != nil {
		return
	}
	if !inferred && start.In(testLoc).Hour() == 20 {
		t.Fatalf("invented a firm 20:00 start %s", start)
	}
}
