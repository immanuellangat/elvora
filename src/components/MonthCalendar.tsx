import { addMonths, format, getDaysInMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { DayKey } from '../db/types'
import { WEEKDAY_LETTER, dayKey, orderedWeekdays } from '../lib/dates'

export function MonthCalendar({
  weekStartsOn,
  renderDay,
  initialMonth,
}: {
  weekStartsOn: 0 | 1
  renderDay: (key: DayKey, date: Date) => ReactNode
  initialMonth?: Date
}) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()))
  const first = startOfMonth(month)
  const lead = (first.getDay() - weekStartsOn + 7) % 7
  const days = getDaysInMonth(month)
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1)),
  ]
  const isCurrent = format(month, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button aria-label="Previous month" className="rounded-xl p-2 text-muted hover:bg-surface-2" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <div className="font-display font-bold">{format(month, 'MMMM yyyy')}</div>
        <button
          aria-label="Next month"
          disabled={isCurrent}
          className="rounded-xl p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {orderedWeekdays(weekStartsOn).map((d) => (
          <div key={d} className="pb-1 text-xs font-semibold text-faint">
            {WEEKDAY_LETTER[d]}
          </div>
        ))}
        {cells.map((d, i) => (d ? <div key={i}>{renderDay(dayKey(d), d)}</div> : <div key={i} />))}
      </div>
    </div>
  )
}
