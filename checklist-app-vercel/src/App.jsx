import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Settings as SettingsIcon, LayoutList, CalendarDays, Search, SortAsc, CheckSquare } from 'lucide-react'
import CalendarView from './components/CalendarView'
import ChecklistCard from './components/ChecklistCard'
import SettingsPanel from './components/SettingsPanel'
import { getChecklists, createChecklist, dailyFlush } from './api'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const COLOR_OPTIONS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
]

// Generate next 30 days in DD-MM-YYYY format (UTC+7)
function next30Days() {
  const days = []
  const now = new Date(Date.now() + 7 * 3600_000)
  for (let i = 1; i <= 30; i++) {
    const d = new Date(now.getTime() + i * 86400_000)
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const yy = d.getUTCFullYear()
    days.push(`${dd}-${mm}-${yy}`)
  }
  return days
}

function CreateChecklistModal({ onClose, onCreate }) {
  const [type, setType]       = useState('special')   // 'date' | 'special'
  const [title, setTitle]     = useState('')
  const [color, setColor]     = useState('#3b82f6')
  const [desc, setDesc]       = useState('')
  const [loading, setLoading] = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const inputRef = useRef(null)
  const days = next30Days()

  // When switching type, reset title & color defaults
  const switchType = (t) => {
    setType(t)
    setTitle('')
    setColor(t === 'date' ? '#f59e0b' : '#3b82f6')
    setShowDrop(false)
  }

  const pickDay = (day) => {
    setTitle(day)
    setShowDrop(false)
    inputRef.current?.focus()
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const res = await createChecklist({ title: title.trim(), description: desc, color, checklist_type: type })
      onCreate(res.data)
      onClose()
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#1a1d27] border border-[#2a2f45] rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
        <div className="px-6 pt-5 pb-4 border-b border-[#2a2f45]">
          <h2 className="text-base font-bold text-white">Tạo checklist mới</h2>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Loại checklist</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => switchType('special')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all cursor-pointer
                  ${type === 'special'
                    ? 'bg-blue-600/20 border-blue-500/60 text-blue-300'
                    : 'bg-[#252a40] border-[#2a2f45] text-slate-400 hover:text-white'}`}>
                ✦ Special
              </button>
              <button type="button" onClick={() => switchType('date')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all cursor-pointer
                  ${type === 'date'
                    ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                    : 'bg-[#252a40] border-[#2a2f45] text-slate-400 hover:text-white'}`}>
                📅 Date
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-1.5">
              {type === 'date'
                ? 'Đến ngày đó, tasks sẽ tự chuyển vào Daily Tasks rồi xóa checklist này.'
                : 'Checklist thông thường, không có hành vi tự động theo ngày.'}
            </p>
          </div>

          {/* Title + dropdown */}
          <div className="relative">
            <label className="block text-sm font-medium text-slate-400 mb-2">Tiêu đề *</label>
            <input
              ref={inputRef}
              autoFocus
              value={title}
              onChange={e => { setTitle(e.target.value); if (type === 'date') setShowDrop(true) }}
              onFocus={() => type === 'date' && setShowDrop(true)}
              placeholder={type === 'date' ? 'Chọn hoặc nhập DD-MM-YYYY...' : 'Tên checklist...'}
              className="w-full bg-[#252a40] border border-[#2a2f45] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />
            {/* Date dropdown */}
            {type === 'date' && showDrop && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1d27] border border-[#2a2f45] rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                {days
                  .filter(d => !title || d.startsWith(title))
                  .map(day => (
                    <button key={day} type="button"
                      onMouseDown={e => { e.preventDefault(); pickDay(day) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2">
                      <span className="text-amber-400 text-xs">📅</span>{day}
                    </button>
                  ))}
                {days.filter(d => !title || d.startsWith(title)).length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-600">Nhập thủ công DD-MM-YYYY</div>
                )}
              </div>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Màu sắc</label>
            <div className="flex gap-3 flex-wrap">
              {COLOR_OPTIONS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-9 h-9 rounded-full transition-all cursor-pointer ${color === c ? 'ring-2 ring-offset-2 ring-offset-[#1a1d27] ring-white scale-110' : 'hover:scale-110'}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          {/* Desc */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Mô tả (tuỳ chọn)</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              rows={2} placeholder="Mô tả ngắn..."
              className="w-full bg-[#252a40] border border-[#2a2f45] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-3 bg-[#252a40] border border-[#2a2f45] text-slate-300 hover:text-white text-sm rounded-xl transition-colors cursor-pointer font-medium">
              Huỷ
            </button>
            <button type="submit" disabled={!title.trim() || loading}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl font-semibold transition-colors disabled:opacity-50 cursor-pointer">
              {loading ? 'Đang tạo...' : 'Tạo checklist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DayDetailPanel({ dateStr, onClose }) {
  const [tasks, setTasks] = useState(null)

  useEffect(() => {
    if (!dateStr) return
    const [y, m] = dateStr.split('-').map(Number)
    import('./api').then(({ getCalendar }) =>
      getCalendar(y, m).then(r => {
        const day = r.data.find(d => d.date === dateStr)
        setTasks(day ? day.tasks : [])
      })
    )
  }, [dateStr])

  const cycleStatus = (task) => {
    let patch
    if (task.completed)     patch = { completed: false, in_progress: false }
    else if (task.in_progress) patch = { completed: true, in_progress: false }
    else                    patch = { in_progress: true, completed: false }

    import('./api').then(({ updateTask }) => updateTask(task.id, patch))
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t))
  }

  if (!dateStr) return null

  const done = tasks ? tasks.filter(t => t.completed).length : 0
  const inProg = tasks ? tasks.filter(t => t.in_progress && !t.completed).length : 0

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center p-4 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#1a1d27] border border-[#2a2f45] rounded-2xl w-full max-w-sm shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-[#2a2f45] flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 capitalize">
              {(() => { try { return format(new Date(dateStr + 'T00:00'), 'EEEE', { locale: vi }) } catch { return '' } })()}
            </div>
            <h3 className="text-base font-bold text-white">{dateStr}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-lg">✕</button>
        </div>

        <div className="p-4">
          {!tasks ? (
            <div className="text-center text-slate-600 py-4 text-sm">Đang tải...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center text-slate-600 py-6 text-sm">Không có task nào ngày này.</div>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => (
                <div key={t.id} className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all
                  ${t.completed   ? 'bg-emerald-950/30 border-emerald-800/40' :
                    t.in_progress ? 'bg-amber-950/20 border-amber-800/30'     :
                                    'bg-[#252a40] border-[#2a2f45]'}`}>
                  {/* Status dot button */}
                  <button onClick={() => cycleStatus(t)}
                    title="Chuyển trạng thái"
                    className="flex-shrink-0 cursor-pointer hover:scale-110 transition-transform">
                    <span className={`block w-3 h-3 rounded-full ${
                      t.completed   ? 'bg-emerald-400 ring-2 ring-emerald-400/30' :
                      t.in_progress ? 'bg-amber-400 ring-2 ring-amber-400/30'     :
                                      'border-2 border-slate-500'
                    }`} />
                  </button>
                  <span className={`text-sm flex-1 ${
                    t.completed   ? 'line-through text-slate-500' :
                    t.in_progress ? 'text-amber-100' : 'text-slate-200'
                  }`}>{t.title}</span>
                  {t.in_progress && !t.completed && (
                    <span className="text-[10px] text-amber-400 font-medium flex-shrink-0">Đang làm</span>
                  )}
                  {t.completed && (
                    <span className="text-[10px] text-emerald-500 font-medium flex-shrink-0">✓</span>
                  )}
                </div>
              ))}
              <div className="text-xs text-slate-600 pt-1">
                {done}/{tasks.length} hoàn thành{inProg > 0 ? ` · ${inProg} đang làm` : ''}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [checklists, setChecklists] = useState([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState('list')
  const [search, setSearch]         = useState('')
  const [sort, setSort]             = useState('date_desc')
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedDate, setSelectedDate] = useState(null)
  const [clock, setClock]           = useState('')

  // Live clock (VN time UTC+7)
  useEffect(() => {
    const tick = () => {
      const vn = new Date(Date.now() + 7 * 3600_000)
      const hh = String(vn.getUTCHours()).padStart(2, '0')
      const mm = String(vn.getUTCMinutes()).padStart(2, '0')
      const ss = String(vn.getUTCSeconds()).padStart(2, '0')
      setClock(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(() => {
    return getChecklists().then(r => setChecklists(r.data)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    // Flush overdue daily tasks first, then load checklists
    dailyFlush().finally(() => load())
  }, [load])

  // Sync task mutations back to App state so remount always has fresh data
  const handleTaskAdded = useCallback((checklistId, task) => {
    setChecklists(prev => prev.map(c =>
      c.id === checklistId
        ? { ...c, updated_at: new Date().toISOString(), tasks: [...(c.tasks || []), task], task_count: (c.task_count || 0) + 1 }
        : c
    ))
  }, [])

  const filtered = checklists
    .filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'alpha')    return a.title.localeCompare(b.title)
      if (sort === 'progress') return (b.done_count / (b.task_count || 1)) - (a.done_count / (a.task_count || 1))
      // date_desc: sort by most recently updated
      return new Date(b.updated_at) - new Date(a.updated_at)
    })

  const totalTasks = checklists.reduce((s, c) => s + (c.task_count || 0), 0)
  const doneTasks  = checklists.reduce((s, c) => s + (c.done_count || 0), 0)

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-200">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-[#2a2f45] bg-[#0f1117]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
              <CheckSquare className="w-5 h-5 text-white" />
            </div>
            <span className="text-base font-bold text-white hidden sm:block">Checklist</span>
          </div>

          {/* Stats */}
          {totalTasks > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-sm text-slate-500 ml-1">
              <span className="text-emerald-400 font-semibold">{doneTasks}</span>
              <span>/</span>
              <span>{totalTasks}</span>
              <span className="ml-1">hoàn thành</span>
            </div>
          )}

          <div className="flex-1" />

          {/* Live clock */}
          <div className="font-mono text-sm text-blue-300 bg-[#1a1d27] border border-[#2a2f45] px-3 py-1.5 rounded-xl tabular-nums hidden sm:block">
            {clock}
          </div>

          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm checklist..."
              className="w-48 pl-9 pr-3 py-2 text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl outline-none focus:border-blue-500 text-white placeholder:text-slate-600 transition-colors" />
          </div>

          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border border-[#2a2f45]">
            <button onClick={() => setView('list')}
              className={`px-3 py-2 transition-colors cursor-pointer ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-[#1a1d27] text-slate-400 hover:text-white'}`}>
              <LayoutList className="w-5 h-5" />
            </button>
            <button onClick={() => setView('calendar')}
              className={`px-3 py-2 transition-colors cursor-pointer ${view === 'calendar' ? 'bg-blue-600 text-white' : 'bg-[#1a1d27] text-slate-400 hover:text-white'}`}>
              <CalendarDays className="w-5 h-5" />
            </button>
          </div>

          <button onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl bg-[#1a1d27] border border-[#2a2f45] text-slate-400 hover:text-white hover:bg-[#252a40] transition-colors cursor-pointer">
            <SettingsIcon className="w-5 h-5" />
          </button>

          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl font-semibold transition-colors cursor-pointer shadow-lg">
            <Plus className="w-5 h-5" />
            <span className="hidden sm:block">Tạo mới</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-5xl mx-auto px-4 py-6 pb-12 sm:pb-6">

        {/* Mobile search */}
        <div className="sm:hidden mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm checklist..."
            className="w-full pl-9 pr-3 py-3 text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl outline-none focus:border-blue-500 text-white placeholder:text-slate-600 transition-colors" />
        </div>

        {/* Calendar view */}
        <div className={view !== 'calendar' ? 'hidden' : ''}>
          <CalendarView
            onDaySelect={d => setSelectedDate(prev => prev === d ? null : d)}
            selectedDate={selectedDate}
            active={view === 'calendar'}
          />
        </div>

        {/* List view — keep mounted to preserve ChecklistCard local state */}
        <div className={view === 'calendar' ? 'hidden' : ''}>
          <>
            {/* Sort + count */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-500 font-medium">{filtered.length} checklist</span>
              <div className="flex items-center gap-2">
                <SortAsc className="w-4 h-4 text-slate-500" />
                <select value={sort} onChange={e => setSort(e.target.value)}
                  className="text-sm bg-[#1a1d27] border border-[#2a2f45] rounded-xl px-3 py-2 text-slate-300 outline-none cursor-pointer">
                  <option value="date_desc">Mới nhất</option>
                  <option value="alpha">A → Z</option>
                  <option value="progress">Tiến độ</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="text-5xl">📋</div>
                <div className="text-slate-500 text-sm text-center">
                  {search ? 'Không tìm thấy checklist.' : 'Chưa có checklist nào.'}
                  {!search && <div className="mt-1">Bấm <strong className="text-white">Tạo mới</strong> để bắt đầu.</div>}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map(c => (
                  <ChecklistCard
                    key={c.id}
                    checklist={c}
                    onDeleted={id => setChecklists(prev => prev.filter(x => x.id !== id))}
                    onTaskAdded={handleTaskAdded}
                  />
                ))}
              </div>
            )}
          </>
        </div>
      </main>

      {/* Mobile footer clock */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 flex items-center justify-center py-2 bg-[#0f1117]/90 backdrop-blur-md border-t border-[#2a2f45]">
        <span className="font-mono text-sm text-blue-300 tabular-nums">{clock}</span>
      </div>

      {/* Modals */}
      {showCreate   && <CreateChecklistModal onClose={() => setShowCreate(false)} onCreate={c => { setChecklists(prev => [c, ...prev]); setView('list') }} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {selectedDate && <DayDetailPanel dateStr={selectedDate} onClose={() => setSelectedDate(null)} />}
    </div>
  )
}
