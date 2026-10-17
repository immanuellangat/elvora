import clsx from 'clsx'
import { format } from 'date-fns'
import { useEffect, useRef } from 'react'
import type { DayKey } from '../db/types'
import { WEEKDAY_LETTER, orderedWeekdays, parseDay, shiftDay, weekOf } from '../lib/dates'

const LEVELS = ['bg-surface-2', 'bg-brand/25', 'bg-brand/45', 'bg-brand/70', 'bg-brand']

function level(n: number): number {
  if (n <= 0) return 0
  if (n <= 1) return 1
  if (n <= 3) return 2
  if (n <= 5) return 3
  return 4
}

export function Heatmap({ data, today, weeks = 18, weekStartsOn }: { data: Map<DayKey, number>; today: DayKey; weeks?: number; weekStartsOn: 0 | 1 }) {
  const lastWeek = weekOf(today, weekStartsOn)
  const start = shiftDay(lastWeek[0], -(weeks - 1) * 7)
  const columns = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => shiftDay(start, w * 7 + d)))
  const activeDays = [...data.entries()].filter(([d, n]) => n > 0 && d >= start).length
  const scroller = useRef<HTMLDivElement>(null)

  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weeks])

  return (
    <div>
      <div className="flex gap-2">
        <div className="hidden flex-col gap-[3px] pt-5 text-[9px] leading-[14px] text-faint sm:flex">
          {orderedWeekdays(weekStartsOn).map((d, i) => (
            <span key={i} className="h-[14px]">
              {i % 2 === 1 ? WEEKDAY_LETTER[d] : ''}
            </span>
          ))}
        </div>
        <div ref={scroller} className="scrollbar-none min-w-0 flex-1 overflow-x-auto">
          <div className="ml-auto flex w-max gap-[3px] p-0.5">
          {columns.map((col, i) => {
            const first = parseDay(col[0])
            const showMonth = i === 0 || first.getDate() <= 7
            return (
              <div key={i} className="flex w-[14px] shrink-0 flex-col gap-[3px]">
                <span className="h-4 overflow-visible whitespace-nowrap text-[9px] text-faint">{showMonth ? format(first, 'MMM') : ''}</span>
                {col.map((d) => {
                  const n = data.get(d) ?? 0
                  return (
                    <div
                      key={d}
                      title={`${format(parseDay(d), 'EEE, MMM d')}: ${n} activit${n === 1 ? 'y' : 'ies'}`}
                      className={clsx(
                        'h-[14px] w-[14px] rounded-[4px]',
                        d > today ? 'bg-transparent' : LEVELS[level(n)],
                        d === today && 'ring-1 ring-brand ring-offset-1 ring-offset-surface',
                      )}
                    />
                  )
                })}
              </div>
            )
          })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>{activeDays} active days</span>
        <span className="flex items-center gap-1">
          Less
          {LEVELS.map((l) => (
            <span key={l} className={clsx('h-2.5 w-2.5 rounded-[3px]', l)} />
          ))}
          More
        </span>
      </div>
    </div>
  )
}
