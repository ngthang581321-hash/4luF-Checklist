import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

// Checklists
export const getChecklists = ()              => api.get('/checklists')
export const createChecklist = (data)        => api.post('/checklists', data)
export const updateChecklist = (id, data)    => api.patch(`/checklists/${id}`, data)
export const deleteChecklist = (id)          => api.delete(`/checklists/${id}`)
export const getChecklist = (id)             => api.get(`/checklists/${id}`)

// Tasks
export const createTask    = (cid, data)     => api.post(`/checklists/${cid}/tasks`, data)
export const updateTask    = (tid, data)     => api.patch(`/tasks/${tid}`, data)
export const deleteTask    = (tid)           => api.delete(`/tasks/${tid}`)

// Calendar
export const getCalendar   = (year, month)   => api.get('/calendar', { params: { year, month } })

// Liverpool fixtures
export const getLiverpoolFixtures = () => api.get('/liverpool/fixtures')

// Daily flush
export const dailyFlush    = ()              => api.post('/daily-flush')
export const getSettings   = ()              => api.get('/settings')
export const updateSettings = (data)         => api.patch('/settings', data)
export const testTelegram  = ()              => api.post('/settings/test')
