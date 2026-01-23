// ============================================
// Inspiring footer lines for ALL emails
// These bring fun, cool, peaceful, kind energy to every touchpoint
// ============================================

export const INSPIRING_FOOTERS = [
  // About Đà Lạt
  "Where the pines whisper and friendships bloom 🌲",
  "Life is better at 1,500 meters above sea level",
  "The City of Eternal Spring welcomes you",
  "Where every sunset paints a masterpiece",
  "Mist, mountains, and meaningful moments",
  "The best conversations happen over cà phê sữa đá",
  "Where cool weather meets warm hearts",
  "Pine forests don't judge, they just listen",
  "Altitude adjusts attitude — in a good way",
  "Where flowers bloom and so do friendships",

  // About connection
  "Humans are wired for connection. Science says so.",
  "The best things in life aren't things — they're moments with people",
  "Every great story starts with 'remember that time we...'",
  "Life's too short for boring weekends",
  "Your future favorite memory is waiting to happen",
  "Adventures are better when shared",
  "The universe rewards those who show up",
  "Good vibes are contagious. Spread them.",
  "One 'yes' can change everything",
  "Strangers are just friends you haven't met yet",

  // Playful/Humorous
  "Your couch will still be there. This moment won't.",
  "FOMO is real. Just saying.",
  "Plot twist: you actually have fun",
  "Warning: may cause spontaneous happiness",
  "Side effects include: new friends, good memories",
  "Spoiler alert: it's going to be great",
  "Netflix can wait. This can't.",
  "Your calendar was feeling lonely anyway",
  "Pro tip: say yes more often",
  "Future you will thank present you",

  // Motivational
  "The magic happens outside your comfort zone",
  "Every adventure begins with a single step",
  "Life begins at the end of your comfort zone",
  "Collect moments, not things",
  "Be the energy you want to attract",
  "Small moments, big memories",
  "Show up. That's half the battle.",
  "Today's choices become tomorrow's memories",
  "Fortune favors the bold (and those who RSVP)",
  "The best is yet to come",

  // Community vibes
  "Together we're stronger, louder, and way more fun",
  "Community isn't a place, it's a feeling",
  "We rise by lifting others",
  "Find your tribe, love them hard",
  "Great things happen when people come together",
  "Solo is fine. Together is magic.",
  "Your people are out there. Go find them.",
  "The more the merrier — seriously",
  "Building memories, one event at a time",
  "Where community happens",

  // About events
  "The best events are the ones you almost didn't attend",
  "Every legendary night started with 'should I go?'",
  "Events are just excuses to be together",
  "The venue is nice, but the people make it special",
  "Life's a party — you're invited",
  "Good times guaranteed (terms and conditions apply: you showing up)",
  "Memories loading... please attend",
  "This is your sign to go",
  "RSVPs: turning maybes into memories since forever",
  "Click yes. Thank us later.",

  // Đà Lạt specific humor
  "Even the weather says it's perfect for going out",
  "Đà Lạt nights are made for adventures",
  "The pine trees approve of your decision to attend",
  "Artichoke tea optional, fun mandatory",
  "Where jackets are a fashion statement, not a necessity",
  "Coffee tastes better at high altitude. Fact.",
  "The mist adds mystery. You add the magic.",
  "Wear layers, make memories",
  "Valley views and good company",
  "Where every photo is Instagram-worthy",

  // Life philosophy
  "In the end, we only regret the chances we didn't take",
  "Life isn't about finding yourself, it's about creating yourself",
  "The best time to plant a tree was 20 years ago. Second best: now.",
  "Be present. Be curious. Be there.",
  "Happiness is only real when shared",
  "You miss 100% of the events you don't attend",
  "Live more, scroll less",
  "Say yes to new adventures",
  "Life rewards action, not intention",
  "Today is a gift — that's why it's called the present",

  // Warm & fuzzy
  "Sending this with good vibes attached",
  "Hope to see your smile there",
  "Your presence makes a difference",
  "Can't wait to create memories with you",
  "Hoping our paths cross soon",
  "Looking forward to real conversations",
  "Here's to new beginnings",
  "May your journey be filled with wonder",
  "Wishing you adventures and laughter",
  "Until we meet — take care of yourself",
];

/**
 * Get a random inspiring footer line for emails
 */
export function getRandomInspiringFooter(): string {
  return INSPIRING_FOOTERS[Math.floor(Math.random() * INSPIRING_FOOTERS.length)];
}
