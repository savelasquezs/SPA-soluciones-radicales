// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeCalendarEvent, type CalendarEventInput } from './calendarClient'

const fetchMock=vi.fn<typeof fetch>()
const input: CalendarEventInput={ serviceId:'10000000-0000-4000-8000-000000000001',summary:'Visita sintética',description:'Prueba',location:'Sede de prueba',start:'2030-10-07T14:00:00Z',end:'2030-10-07T15:30:00Z',attendees:['permanente@example.invalid','nuevo@example.invalid'] }
const eventId='sr10000000000040008000000000000001'
const reply=(value: unknown,status=200)=>new Response(JSON.stringify(value),{ status,headers:{ 'Content-Type':'application/json' } })
beforeEach(()=>{ fetchMock.mockReset(); vi.stubGlobal('fetch',fetchMock) })
afterEach(()=>vi.unstubAllGlobals())

describe('Calendar event delivery',()=>{
  it('preserves remaining RSVP values, removes unassigned attendees and uses conditional PATCH',async()=>{
    fetchMock.mockResolvedValueOnce(reply({ id:eventId,etag:'"version-1"',attendees:[{ email:'permanente@example.invalid',responseStatus:'accepted' },{ email:'retirado@example.invalid',responseStatus:'accepted' }] }))
      .mockResolvedValueOnce(reply({ id:eventId }))
    expect(await writeCalendarEvent(input,'synthetic-token')).toBe(eventId)
    const [url,init]=fetchMock.mock.calls[1]!
    expect(String(url)).toContain('sendUpdates=all');expect(init?.method).toBe('PATCH')
    expect(init?.headers).toMatchObject({ 'If-Match':'"version-1"' })
    expect(JSON.parse(String(init?.body)).attendees).toEqual([{ email:'permanente@example.invalid',responseStatus:'accepted' },{ email:'nuevo@example.invalid' }])
  })
  it('uses the same deterministic ID after an uncertain creation',async()=>{
    fetchMock.mockResolvedValueOnce(reply({},404)).mockResolvedValueOnce(reply({},409))
      .mockResolvedValueOnce(reply({ id:eventId,etag:'"v1"' })).mockResolvedValueOnce(reply({ id:eventId }))
    await writeCalendarEvent(input,'synthetic-token')
    expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).id).toBe(eventId)
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(eventId)
  })
  it('cancels an already missing event without recreating it',async()=>{
    fetchMock.mockResolvedValueOnce(reply({},410))
    await writeCalendarEvent({ ...input,cancelled:true },'synthetic-token')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })
  it('does not overwrite a concurrent external edit',async()=>{
    fetchMock.mockResolvedValueOnce(reply({ id:eventId,etag:'"old"' })).mockResolvedValueOnce(reply({},412))
    await expect(writeCalendarEvent(input,'synthetic-token')).rejects.toMatchObject({ code:'CALENDAR_VERSION_CONFLICT' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
