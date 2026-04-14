import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { getCalendar, getLiverpoolFixtures } from '../api'
import { format, startOfMonth, endOfMonth, eachDayOfInterval,
         getDay, isToday, isSameMonth, addMonths, subMonths,
         startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns'
import { vi } from 'date-fns/locale'

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function dayColor(info) {
  if (!info || info.total === 0) return null
  const pct = info.done / info.total
  if (pct === 1) return 'green'
  if (info.in_progress > 0 || pct >= 0.5) return 'yellow'
  return 'red'
}

function DayCell({ date, info, isCurrentMonth, onClick, selected, matchInfo }) {
  const today    = isToday(date)
  const color    = isCurrentMonth ? dayColor(info) : null
  const dateStr  = format(date, 'yyyy-MM-dd')
  const hasMatch = isCurrentMonth && matchInfo

  const bg = hasMatch
    ? 'bg-red-950/70 border-red-600/60 hover:bg-red-900/70'
    : color === 'green'  ? 'bg-emerald-950/60 border-emerald-700/50 hover:bg-emerald-900/60'
    : color === 'yellow' ? 'bg-amber-950/60 border-amber-700/50 hover:bg-amber-900/60'
    : color === 'red'    ? 'bg-red-950/60 border-red-700/50 hover:bg-red-900/60'
    :                      'bg-[#1e2235]/60 border-[#2a2f45]/50 hover:bg-[#252a40]/80'

  return (
    <div
      onClick={() => isCurrentMonth && onClick(dateStr, info)}
      className={`relative rounded-xl border p-2 min-h-[72px] cursor-pointer transition-all duration-150
        ${bg}
        ${!isCurrentMonth ? 'opacity-25 cursor-default' : ''}
        ${selected === dateStr ? 'ring-2 ring-blue-500' : ''}
      `}
    >
      <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
        ${today ? 'bg-blue-500 text-white' : 'text-slate-400'}`}>
        {format(date, 'd')}
      </div>

      {/* Liverpool match badge */}
      {hasMatch && (
        <div className="mt-1">
          <div className="flex items-center gap-0.5 text-[10px] font-bold text-red-300">
            <span>⚽</span>
            <span className="truncate">{matchInfo.opponent}</span>
          </div>
          <div className={`text-[10px] text-red-400/80 font-medium`}>
            {matchInfo.time} {matchInfo.is_home ? '🏠' : '✈️'}
          </div>
        </div>
      )}

      {info && isCurrentMonth && (
        <div className="mt-1 space-y-0.5">
          <div className={`text-[10px] font-medium ${
            hasMatch ? 'text-red-400/70' :
            color === 'green' ? 'text-emerald-400' :
            color === 'yellow' ? 'text-amber-400' : 'text-red-400'
          }`}>
            {info.done}/{info.total}
          </div>
          <div className="flex gap-0.5 flex-wrap">
            {(info.tasks || []).slice(0, 5).map((t, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${
                t.completed   ? 'bg-emerald-400' :
                t.in_progress ? 'bg-amber-400'   : 'bg-slate-400'
              }`} />
            ))}
            {info.total > 5 && <span className="text-[9px] text-slate-500">+{info.total - 5}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function WeekDayCell({ date, info, onClick, selected, matchInfo }) {
  const today    = isToday(date)
  const color    = dayColor(info)
  const dateStr  = format(date, 'yyyy-MM-dd')
  const hasMatch = !!matchInfo

  const headerBg = hasMatch
    ? 'bg-red-900/50 border-red-600/50'
    : color === 'green'  ? 'bg-emerald-900/40 border-emerald-700/40'
    : color === 'yellow' ? 'bg-amber-900/40 border-amber-700/40'
    : color === 'red'    ? 'bg-red-900/40 border-red-700/40'
    :                      'bg-[#1e2235] border-[#2a2f45]'

  return (
    <div
      onClick={() => onClick(dateStr, info)}
      className={`rounded-xl border overflow-hidden cursor-pointer transition-all duration-150 hover:ring-1 hover:ring-blue-500/50
        ${headerBg}
        ${selected === dateStr ? 'ring-2 ring-blue-500' : ''}
      `}
    >
      {/* Day header */}
      <div className={`px-3 py-2 border-b ${headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
            ${today ? 'bg-blue-500 text-white' : 'text-slate-300'}`}>
            {format(date, 'd')}
          </span>
          <span className="text-xs text-slate-400 capitalize">
            {format(date, 'EEE', { locale: vi })}
          </span>
        </div>
        {info && (
          <span className={`text-[10px] font-medium ${
            hasMatch ? 'text-red-300' :
            color === 'green' ? 'text-emerald-400' :
            color === 'yellow' ? 'text-amber-400' :
            color === 'red' ? 'text-red-400' : 'text-slate-500'
          }`}>
            {info.done}/{info.total}
          </span>
        )}
      </div>

      {/* Task list */}
      <div className="p-2 space-y-1 min-h-[80px]">
        {/* Liverpool match row */}
        {hasMatch && (
          <div className="flex items-center gap-1.5 px-1 py-1 rounded-lg bg-red-900/40 border border-red-700/40 mb-1">
            <span className="text-sm">⚽</span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-red-200 truncate">{matchInfo.opponent}</div>
              <div className="text-[10px] text-red-400">{matchInfo.time} {matchInfo.is_home ? '🏠 Home' : '✈️ Away'}</div>
            </div>
          </div>
        )}
        {!info || info.tasks?.length === 0 ? (
          <div className="text-[10px] text-slate-600 pt-1 text-center">—</div>
        ) : (
          (info.tasks || []).map((t, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                t.completed   ? 'bg-emerald-400' :
                t.in_progress ? 'bg-amber-400'   : 'bg-slate-500'
              }`} />
              <span className={`text-[11px] truncate ${
                t.completed ? 'line-through text-slate-600' :
                t.in_progress ? 'text-amber-200' : 'text-slate-300'
              }`}>{t.title}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function CalendarView({ onDaySelect, selectedDate, active }) {
  const [current, setCurrent]   = useState(new Date())
  const [calData, setCalData]   = useState({})
  const [loading, setLoading]   = useState(false)
  const [view, setView]         = useState('month')
  const [fixtures, setFixtures] = useState({})   // { 'YYYY-MM-DD': {opponent, time, is_home} }

  const year  = current.getFullYear()
  const month = current.getMonth() + 1

  // Fetch Liverpool fixtures once on mount
  useEffect(() => {
    getLiverpoolFixtures()
      .then(r => {
        const map = {}
        for (const f of r.data) {
          map[f.date] = f   // one match per day (if 2 matches same day, last wins — rare)
        }
        setFixtures(map)
      })
      .catch(() => {})   // silent fail — calendar still works without fixtures
  }, [])

  const fetchData = (refDate) => {
    const d = refDate || current
    setLoading(true)
    const y = d.getFullYear(), m = d.getMonth() + 1
    getCalendar(y, m)
      .then(r => {
        const map = {}
        r.data.forEach(d => { map[d.date] = d })
        setCalData(prev => ({ ...prev, ...map }))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [year, month])
  useEffect(() => { if (active) fetchData() }, [active])

  // ── Month view grid ──────────────────────────────────────────────────────
  const firstDay = startOfMonth(current)
  const lastDay  = endOfMonth(current)
  const days     = eachDayOfInterval({ start: firstDay, end: lastDay })
  const startPad = getDay(firstDay)
  const padDays  = startPad > 0
    ? eachDayOfInterval({ start: new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - startPad), end: new Date(firstDay.getFullYear(), firstDay.getMonth(), 0) })
    : []
  const totalCells = Math.ceil((padDays.length + days.length) / 7) * 7
  const endPad  = totalCells - padDays.length - days.length
  const endDays = endPad > 0
    ? eachDayOfInterval({ start: new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 1), end: new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, endPad) })
    : []
  const allCells = [...padDays, ...days, ...endDays]

  // ── Week view ────────────────────────────────────────────────────────────
  const weekStart = startOfWeek(current, { weekStartsOn: 0 })
  const weekEnd   = endOfWeek(current,   { weekStartsOn: 0 })
  const weekDays  = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const prevPeriod = () => view === 'week' ? setCurrent(subWeeks(current, 1)) : setCurrent(subMonths(current, 1))
  const nextPeriod = () => view === 'week' ? setCurrent(addWeeks(current, 1)) : setCurrent(addMonths(current, 1))

  const totalTasks = Object.values(calData).reduce((s, d) => s + d.total, 0)
  const doneTasks  = Object.values(calData).reduce((s, d) => s + d.done, 0)

  const headerLabel = view === 'week'
    ? `${format(weekStart, 'd MMM', { locale: vi })} – ${format(weekEnd, 'd MMM yyyy', { locale: vi })}`
    : format(current, 'MMMM yyyy', { locale: vi })

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-white capitalize truncate">
            {headerLabel}
          </h2>
          {loading && <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          {totalTasks > 0 && (
            <div className="hidden sm:flex items-center text-xs text-slate-400 mr-1">
              <span><span className="text-emerald-400 font-medium">{doneTasks}</span>/{totalTasks}</span>
            </div>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[#2a2f45]">
            {['month', 'week'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer
                  ${view === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white bg-[#1e2235]'}`}>
                {v === 'month' ? 'Tháng' : 'Tuần'}
              </button>
            ))}
          </div>

          {/* Today */}
          <button onClick={() => setCurrent(new Date())}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#1e2235] border border-[#2a2f45] text-slate-300 hover:text-white transition-colors cursor-pointer">
            Hôm nay
          </button>

          {/* Prev / Next */}
          <button onClick={prevPeriod}
            className="p-1.5 rounded-lg bg-[#1e2235] border border-[#2a2f45] text-slate-400 hover:text-white transition-colors cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={nextPeriod}
            className="p-1.5 rounded-lg bg-[#1e2235] border border-[#2a2f45] text-slate-400 hover:text-white transition-colors cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">{d}</div>
        ))}
      </div>

      {/* ── Month grid ── */}
      {view === 'month' && (
        <div className="grid grid-cols-7 gap-1.5">
          {allCells.map((date, i) => {
            const dateStr = format(date, 'yyyy-MM-dd')
            return (
              <DayCell key={i} date={date} info={calData[dateStr]}
                isCurrentMonth={isSameMonth(date, current)}
                onClick={onDaySelect} selected={selectedDate}
                matchInfo={fixtures[dateStr]} />
            )
          })}
        </div>
      )}

      {/* ── Week grid ── */}
      {view === 'week' && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((date, i) => {
            const dateStr = format(date, 'yyyy-MM-dd')
            return (
              <WeekDayCell key={i} date={date} info={calData[dateStr]}
                onClick={onDaySelect} selected={selectedDate}
                matchInfo={fixtures[dateStr]} />
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs text-slate-500 pt-1 flex-wrap">
        {[
          { color: 'bg-emerald-500', label: 'Xong hết' },
          { color: 'bg-amber-500',   label: 'Đang làm' },
          { color: 'bg-red-500',     label: 'Chưa làm' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            {label}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span>⚽</span>
          <span>Liverpool đá</span>
        </div>
      </div>
    </div>
  )
}
