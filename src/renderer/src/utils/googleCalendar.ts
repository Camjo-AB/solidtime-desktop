import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import type { Dayjs } from 'dayjs'
import type { ExternalCalendarEvent } from '@solidtime/ui'
import { apiClient } from './api'
import { endpoint } from './oauth'
import { dayjs } from './dayjs'

interface GoogleCalendarStatus {
    enabled: boolean
    connected: boolean
    email: string | null
}

interface GoogleCalendarEventResponse {
    id: string
    title: string
    start: string
    end: string
    html_link: string | null
}

// The published @solidtime/api client does not know these Camjo endpoints yet; its axios instance
// still adds the access token and refreshes it.
async function getStatus(): Promise<GoogleCalendarStatus> {
    const response = await apiClient.value.axios.get<{ data: GoogleCalendarStatus }>(
        '/v1/users/me/google-calendar'
    )
    return response.data.data
}

async function getEvents(start: Dayjs, end: Dayjs): Promise<GoogleCalendarEventResponse[]> {
    const response = await apiClient.value.axios.get<{ data: GoogleCalendarEventResponse[] }>(
        '/v1/users/me/google-calendar/events',
        {
            params: {
                start: dayjs(start).utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
                end: dayjs(end).utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
            },
        }
    )
    return response.data.data
}

/** Where people connect their Google Calendar (OAuth runs in the web app). */
export const googleCalendarConnectUrl = computed(
    () => endpoint.value + '/user/profile#google-calendar'
)

export function useGoogleCalendarEvents(
    start: Ref<Dayjs | undefined>,
    end: Ref<Dayjs | undefined>
) {
    const statusQuery = useQuery({
        queryKey: ['google-calendar-status', endpoint],
        queryFn: getStatus,
        staleTime: 1000 * 60 * 5,
        retry: false,
    })
    const enabled = computed(() => statusQuery.data.value?.enabled ?? false)
    const connected = computed(() => statusQuery.data.value?.connected ?? false)

    const eventsQuery = useQuery({
        queryKey: computed(() => [
            'google-calendar-events',
            start.value?.toISOString(),
            end.value?.toISOString(),
        ]),
        queryFn: () => getEvents(start.value!, end.value!),
        enabled: () => connected.value && !!start.value && !!end.value,
        staleTime: 1000 * 60,
        retry: false,
    })

    const events = computed<ExternalCalendarEvent[]>(() =>
        (eventsQuery.data.value ?? []).map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            htmlLink: event.html_link,
        }))
    )
    const needsReconnect = computed(() => eventsQuery.error.value !== null)

    return { enabled, connected, events, needsReconnect }
}
