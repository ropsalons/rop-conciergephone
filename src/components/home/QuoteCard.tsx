import { useMemo, useState } from 'react'
import { ChevronLeft, Sparkles } from '@/components/ui/Icons'

// Rob's rotation: a curated set of quotes from voices he follows (classic personal-development +
// modern). Five different quotes surface across each day, and you can click ‹ › to browse the rest.
type Quote = { text: string; author: string }

const QUOTES: Quote[] = [
  // Wayne Dyer
  { text: 'If you change the way you look at things, the things you look at change.', author: 'Wayne Dyer' },
  { text: 'How people treat you is their karma; how you react is yours.', author: 'Wayne Dyer' },
  { text: 'Your problems are not the problem. Your way of looking at them is.', author: 'Wayne Dyer' },
  // Stephen Covey
  { text: 'Begin with the end in mind.', author: 'Stephen Covey' },
  { text: 'The main thing is to keep the main thing the main thing.', author: 'Stephen Covey' },
  { text: 'Seek first to understand, then to be understood.', author: 'Stephen Covey' },
  { text: 'Most of us spend too much time on what is urgent and not enough on what is important.', author: 'Stephen Covey' },
  // Dale Carnegie
  { text: 'You can make more friends in two months by becoming interested in other people than in two years trying to get people interested in you.', author: 'Dale Carnegie' },
  { text: 'Most of the important things in the world have been accomplished by people who kept trying when there seemed to be no hope at all.', author: 'Dale Carnegie' },
  { text: 'People rarely succeed unless they have fun in what they are doing.', author: 'Dale Carnegie' },
  // Zig Ziglar
  { text: 'You don’t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { text: 'Your attitude, not your aptitude, will determine your altitude.', author: 'Zig Ziglar' },
  { text: 'You can have everything in life you want, if you will just help enough other people get what they want.', author: 'Zig Ziglar' },
  { text: 'F-E-A-R has two meanings: Forget Everything And Run, or Face Everything And Rise. The choice is yours.', author: 'Zig Ziglar' },
  // Jim Rohn
  { text: 'Success is nothing more than a few simple disciplines, practiced every day.', author: 'Jim Rohn' },
  { text: 'Don’t wish it were easier; wish you were better.', author: 'Jim Rohn' },
  { text: 'Either you run the day, or the day runs you.', author: 'Jim Rohn' },
  { text: 'We must all suffer one of two things: the pain of discipline or the pain of regret.', author: 'Jim Rohn' },
  // Alex Hormozi
  { text: 'The successful person does what the unsuccessful person is unwilling to do.', author: 'Alex Hormozi' },
  { text: 'The only difference between where you are and where you want to be is the behavior you’re willing to change.', author: 'Alex Hormozi' },
  { text: 'You do not get to have both your excuses and your dreams. You have to pick one.', author: 'Alex Hormozi' },
  { text: 'The person willing to do the boring work for longer wins.', author: 'Alex Hormozi' },
  // Gary Vaynerchuk
  { text: 'Skills are cheap. Passion is priceless.', author: 'Gary Vaynerchuk' },
  { text: 'Ideas are worthless until you execute them.', author: 'Gary Vaynerchuk' },
  { text: 'Legacy is greater than currency.', author: 'Gary Vaynerchuk' },
  // Jordan Peterson
  { text: 'Compare yourself to who you were yesterday, not to who someone else is today.', author: 'Jordan Peterson' },
  { text: 'Set your house in perfect order before you criticize the world.', author: 'Jordan Peterson' },
  { text: 'Pursue what is meaningful, not what is expedient.', author: 'Jordan Peterson' },
  { text: 'Treat yourself like someone you are responsible for helping.', author: 'Jordan Peterson' },
  // Tony Robbins
  { text: 'The only impossible journey is the one you never begin.', author: 'Tony Robbins' },
  { text: 'It is in your moments of decision that your destiny is shaped.', author: 'Tony Robbins' },
  // Simon Sinek
  { text: 'Working hard for something we don’t care about is stress; working hard for something we love is passion.', author: 'Simon Sinek' },
  { text: 'Dream big. Start small. But most of all, start.', author: 'Simon Sinek' },
  // John Maxwell
  { text: 'A leader is one who knows the way, goes the way, and shows the way.', author: 'John Maxwell' },
  { text: 'Change is inevitable. Growth is optional.', author: 'John Maxwell' },
  // Napoleon Hill
  { text: 'Whatever the mind can conceive and believe, it can achieve.', author: 'Napoleon Hill' },
  { text: 'The starting point of all achievement is desire.', author: 'Napoleon Hill' },
  // Earl Nightingale
  { text: 'You become what you think about most of the time.', author: 'Earl Nightingale' },
  { text: 'Success is the progressive realization of a worthy ideal.', author: 'Earl Nightingale' },
]

// 5 quotes surface per day. The visible quote is chosen deterministically from the day + time-slot,
// so it changes ~5 times a day and everyone on the team sees the same one at the same time.
const SLOTS_PER_DAY = 5

function baseIndexNow(): number {
  const now = new Date()
  const dayNumber = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
  )
  const slot = Math.min(SLOTS_PER_DAY - 1, Math.floor(now.getHours() / (24 / SLOTS_PER_DAY)))
  return (dayNumber * SLOTS_PER_DAY + slot) % QUOTES.length
}

export function QuoteCard() {
  const base = useMemo(baseIndexNow, [])
  const [offset, setOffset] = useState(0)
  const idx = ((base + offset) % QUOTES.length + QUOTES.length) % QUOTES.length
  const q = QUOTES[idx]

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
