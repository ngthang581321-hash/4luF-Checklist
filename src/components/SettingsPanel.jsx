import { useState, useEffect } from 'react'
import { getSettings, updateSettings, testTelegram } from '../api'
import { Settings, Send, CheckCircle, XCircle } from 'lucide-react'

export default function SettingsPanel({ onClose }) {
  const [settings, setSettings] = useState({ telegram_token: '', telegram_chat_id: '', notify_new_task: true, notify_complete: true })
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg]         = useState(null)

  useEffect(() => {
    getSettings().then(r => setSettings(r.data))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      setMsg({ ok: true, text: 'Đã lưu cài đặt!' })
    } catch {
      setMsg({ ok: false, text: 'Lỗi khi lưu.' })
    } finally { setSaving(false); setTimeout(() => setMsg(null), 3000) }
  }

  const test = async () => {
    setTesting(true)
    try {
      await testTelegram()
      setMsg({ ok: true, text: 'Gửi test thành công! Kiểm tra Telegram của bạn.' })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'Lỗi gửi test.' })
    } finally { setTesting(false); setTimeout(() => setMsg(null), 5000) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#1a1d27] border border-[#2a2f45] rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2a2f45]">
          <Settings className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">Cài đặt Telegram</h2>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Bot Token</label>
            <input
              type="password"
              value={settings.telegram_token}
              onChange={e => setSettings(s => ({ ...s, telegram_token: e.target.value }))}
              placeholder="123456789:AABBcc..."
              className="w-full bg-[#252a40] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />
            <p className="text-[11px] text-slate-600 mt-1">Lấy từ @BotFather trên Telegram</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Chat ID</label>
            <input
              value={settings.telegram_chat_id}
              onChange={e => setSettings(s => ({ ...s, telegram_chat_id: e.target.value }))}
              placeholder="-1001234567890"
              className="w-full bg-[#252a40] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
            />
            <p className="text-[11px] text-slate-600 mt-1">ID của chat/group/channel nhận thông báo</p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-400">Loại thông báo</label>
            {[
              { key: 'notify_new_task', label: '📋 Task mới được thêm' },
              { key: 'notify_complete', label: '✅ Task được hoàn thành' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                  className={`relative w-9 h-5 rounded-full transition-colors ${settings[key] ? 'bg-blue-600' : 'bg-slate-700'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${settings[key] ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-sm text-slate-300">{label}</span>
              </label>
            ))}
          </div>

          {msg && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${msg.ok ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800' : 'bg-red-950/50 text-red-400 border border-red-800'}`}>
              {msg.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
              {msg.text}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-5">
          <button onClick={test} disabled={testing || !settings.telegram_token}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#252a40] border border-[#2a2f45] text-slate-300 hover:text-white text-sm rounded-xl transition-colors disabled:opacity-40 cursor-pointer flex-1 justify-center">
            <Send className="w-4 h-4" />
            {testing ? 'Đang gửi...' : 'Gửi test'}
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-xl font-medium transition-colors disabled:opacity-50 cursor-pointer">
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </button>
        </div>
      </div>
    </div>
  )
}
