import { useMemo, useState } from 'react'
import { ChevronLeft, Sparkles } from '@/components/ui/Icons'

// Rob's rotation: a wide mix of voices — classic personal-development, business, and thinkers.
// Grouped by author here for readability; interleaveByAuthor() below spaces them out so the SAME
// author never appears back-to-back in the rotation.
type Quote = { text: string; author: string }

const QUOTES: Quote[] = [
  { text: 'If you change the way you look at things, the things you look at change.', author: 'Wayne Dyer' },
  { text: 'How people treat you is their karma; how you react is yours.', author: 'Wayne Dyer' },
  { text: 'Begin with the end in mind.', author: 'Stephen Covey' },
  { text: 'Seek first to understand, then to be understood.', author: 'Stephen Covey' },
  { text: 'You can make more friends in two months by becoming interested in other people than in two years trying to get people interested in you.', author: 'Dale Carnegie' },
  { text: 'People rarely succeed unless they have fun in what they are doing.', author: 'Dale Carnegie' },
  { text: 'You don’t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { text: 'Your attitude, not your aptitude, will determine your altitude.', author: 'Zig Ziglar' },
  { text: 'Either you run the day, or the day runs you.', author: 'Jim Rohn' },
  { text: 'Don’t wish it were easier; wish you were better.', author: 'Jim Rohn' },
  { text: 'The successful person does what the unsuccessful person is unwilling to do.', author: 'Alex Hormozi' },
  { text: 'You do not get to have both your excuses and your dreams. You have to pick one.', author: 'Alex Hormozi' },
  { text: 'Skills are cheap. Passion is priceless.', author: 'Gary Vaynerchuk' },
  { text: 'Ideas are worthless until you execute them.', author: 'Gary Vaynerchuk' },
  { text: 'Compare yourself to who you were yesterday, not to who someone else is today.', author: 'Jordan Peterson' },
  { text: 'Pursue what is meaningful, not what is expedient.', author: 'Jordan Peterson' },
  { text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
  { text: 'It is in your moments of decision that your destiny is shaped.', author: 'Tony Robbins' },
  { text: 'Working hard for something we don’t care about is stress; working hard for something we love is passion.', author: 'Simon Sinek' },
  { text: 'A leader is one who knows the way, goes the way, and shows the way.', author: 'John Maxwell' },
  { text: 'Whatever the mind can conceive and believe, it can achieve.', author: 'Napoleon Hill' },
  { text: 'You become what you think about most of the time.', author: 'Earl Nightingale' },
  { text: 'People will forget what you said and did, but they will never forget how you made them feel.', author: 'Maya Angelou' },
  { text: 'Nothing will work unless you do.', author: 'Maya Angelou' },
  { text: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', author: 'Ralph Waldo Emerson' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Stay hungry. Stay foolish.', author: 'Steve Jobs' },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
  { text: 'Perfection is not attainable, but if we chase perfection we can catch excellence.', author: 'Vince Lombardi' },
  { text: 'You have power over your mind — not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius' },
  { text: 'Believe you can and you’re halfway there.', author: 'Theodore Roosevelt' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'If you’re going through hell, keep going.', author: 'Winston Churchill' },
  { text: 'Whether you think you can, or you think you can’t — you’re right.', author: 'Henry Ford' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It takes 20 years to build a reputation and five minutes to ruin it.', author: 'Warren Buffett' },
  { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
  { text: 'Change your thoughts and you change your world.', author: 'Norman Vincent Peale' },
  { text: 'Vulnerability is the birthplace of innovation, creativity, and change.', author: 'Brené Brown' },
  { text: 'Good is the enemy of great.', author: 'Jim Collins' },
  { text: 'The goal as a company is to have customer service that is not just the best but legendary.', author: 'Sam Walton' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
  { text: 'Don’t count the days, make the days count.', author: 'Muhammad Ali' },
  { text: 'I’ve failed over and over and over again in my life. And that is why I succeed.', author: 'Michael Jordan' },
  { text: 'The biggest adventure you can take is to live the life of your dreams.', author: 'Oprah Winfrey' },
  { text: 'Always do your best. What you plant now, you will harvest later.', author: 'Og Mandino' },
  { text: 'Instead of wondering when your next vacation is, set up a life you don’t need to escape from.', author: 'Seth Godin' },
]

// Round-robin by author so the same name never lands next to itself (and gets spread far apart).
function interleaveByAuthor(quotes: Quote[]): Quote[] {
  const groups = new Map<string, Quote[]>()
  for (const q of quotes) {
    if (!groups.has(q.author)) groups.set(q.author, [])
    groups.get(q.author)!.push(q)
  }
  const buckets = [...groups.values()]
  const out: Quote[] = []
  for (let i = 0; out.length < quotes.length; i++) {
    for (const b of buckets) if (b[i]) out.push(b[i])
  }
  return out
}

const ROTATION = interleaveByAuthor(QUOTES)

// 5 quotes surface per day. The visible one is chosen from the day + time-slot, so it changes ~5x a
// day and everyone sees the same one at the same time.
const SLOTS_PER_DAY = 5

function baseIndexNow(): number {
  const now = new Date()
  const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000)
  const slot = Math.min(SLOTS_PER_DAY - 1, Math.floor(now.getHours() / (24 / SLOTS_PER_DAY)))
  return (dayNumber * SLOTS_PER_DAY + slot) % ROTATION.length
}

export function QuoteCard() {
  const base = useMemo(baseIndexNow, [])
  const [offset, setOffset] = useState(0)
  const idx = ((base + offset) % ROTATION.length + ROTATION.length) % ROTATION.length
  const q = ROTATION[idx]

  return (
    <section className="card overflow-hidden p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gold-300/80">
          <Sparkles className="h-4 w-4 text-gold-300" />
          Daily inspiration
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Previous quote"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {offset !== 0 && (
            <button
              onClick={() => setOffset(0)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-brand-200 hover:bg-white/10"
            >
              Today
            </button>
          )}
          <button
            onClick={() => setOffset((o) => o + 1)}
            aria-label="Next quote"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </div>
      <blockquote className="text-[15px] font-medium leading-relaxed text-white">
        “{q.text}”
      </blockquote>
      <p className="mt-2 text-sm text-gold-200/90">— {q.author}</p>
    </section>
  )
}
