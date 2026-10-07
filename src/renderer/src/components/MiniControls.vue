<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/16/solid'
import { Coffee, Play } from '@lucide/vue'
import {
    time,
    TimeTrackerProjectTaskDropdown,
    TimeTrackerStartStop,
    TimeTrackerTagDropdown,
} from '@solidtime/ui'
import type { Tag, TimeEntry } from '@solidtime/api'
import { useLiveTimer } from '../utils/liveTimer'
import { useMyMemberships } from '../utils/myMemberships'
import { computed, ref, watch, watchEffect } from 'vue'
import { useStorage } from '@vueuse/core'
import { emptyTimeEntry } from '../utils/timeEntries'
import { useQuery } from '@tanstack/vue-query'
import { getAllProjects } from '../utils/projects'
import { getAllTasks } from '../utils/tasks'
import { getAllTags, useTagCreateMutation } from '../utils/tags'
import { getAllClients } from '../utils/clients'
import type { TimerSelection } from '../../../preload/interface'
import { sendEventToWindow } from '../utils/events'
import { showMainWindow } from '../utils/window'
import { dayjs } from '../utils/dayjs'
import { useBreaksEnabled } from '../utils/organization'
const { liveTimer, startLiveTimer, stopLiveTimer } = useLiveTimer()

const { currentOrganizationId } = useMyMemberships()
const currentTimeEntry = useStorage('currentTimeEntry', { ...emptyTimeEntry })
const lastTimeEntry = useStorage('lastTimeEntry', { ...emptyTimeEntry })

const organizationIdToLoad = computed(() => {
    if (currentTimeEntry.value.organization_id && currentTimeEntry.value.organization_id !== '') {
        return currentTimeEntry.value.organization_id
    }
    return currentOrganizationId.value
})

const currentOrganizationLoaded = computed(() => !!organizationIdToLoad.value)
const breaksEnabled = useBreaksEnabled(organizationIdToLoad)

const isRunning = computed(
    () => currentTimeEntry.value.start !== '' && currentTimeEntry.value.start !== null
)

const isOnBreak = computed(() => isRunning.value && currentTimeEntry.value.type === 'break')

// Guard: a stale stored break entry must never be offered for resume
const canResumeAfterBreak = computed(
    () =>
        isOnBreak.value && lastTimeEntry.value.start !== '' && lastTimeEntry.value.type !== 'break'
)

const resumeDescription = computed(() => lastTimeEntry.value.description || null)

function startBreak() {
    sendEventToWindow('main', 'startBreak')
}

function resumeAfterBreak() {
    sendEventToWindow('main', 'resumeAfterBreak')
}
const { data: projectsResponse } = useQuery({
    queryKey: ['projects', organizationIdToLoad],
    queryFn: () => getAllProjects(organizationIdToLoad.value),
    enabled: currentOrganizationLoaded,
})

const { data: tasksResponse } = useQuery({
    queryKey: ['tasks', organizationIdToLoad],
    queryFn: () => getAllTasks(organizationIdToLoad.value),
    enabled: currentOrganizationLoaded,
})

const { data: currentTimeEntryTasksResponse } = useQuery({
    queryKey: ['tasks', currentTimeEntry.value.organization_id],
    queryFn: () => getAllTasks(currentTimeEntry.value.organization_id),
    enabled: currentOrganizationLoaded,
})

const tasks = computed(() => {
    if (isRunning.value) {
        return currentTimeEntryTasksResponse.value?.data
    }
    return tasksResponse.value?.data
})
const projects = computed(() => {
    return projectsResponse.value?.data
})

const { data: tagsResponse } = useQuery({
    queryKey: ['tags', organizationIdToLoad],
    queryFn: () => getAllTags(organizationIdToLoad.value),
    enabled: currentOrganizationLoaded,
})
const tags = computed(() => tagsResponse.value?.data ?? [])

const { data: clientsResponse } = useQuery({
    queryKey: ['clients', organizationIdToLoad],
    queryFn: () => getAllClients(organizationIdToLoad.value),
    enabled: currentOrganizationLoaded,
})
const clients = computed(() => clientsResponse.value?.data ?? [])

const tagCreate = useTagCreateMutation()
async function createTag(name: string): Promise<Tag | undefined> {
    const response = await tagCreate.mutateAsync({ name })
    return response?.data
}

// Projects cannot be created from the mini window; the picker hides that option.
async function createNothing() {
    return undefined
}

/*
 * Project, task, tags and billable for the entry: the running one, or the next one when stopped
 * (starts as a copy of the last entry, like "continue"). Picking something while stopped only
 * changes what play starts; while running it updates the running entry via the main window.
 */
function selectionFrom(entry: TimeEntry): TimerSelection {
    return {
        project_id: entry.project_id ?? null,
        task_id: entry.task_id ?? null,
        tags: [...(entry.tags ?? [])],
        billable: entry.billable ?? false,
        description: entry.description ?? null,
    }
}

const selection = ref<TimerSelection>(
    selectionFrom(isRunning.value ? currentTimeEntry.value : lastTimeEntry.value)
)

const projectPickerOpen = ref(false)
const tagPickerOpen = ref(false)
const pickerOpen = computed(() => projectPickerOpen.value || tagPickerOpen.value)

watch(
    () => (isRunning.value ? currentTimeEntry.value : lastTimeEntry.value),
    (entry) => {
        // Keep what is being picked right now
        if (!pickerOpen.value) {
            selection.value = selectionFrom(entry)
        }
    },
    { deep: true }
)

watch(pickerOpen, (open) => {
    window.electronAPI.setMiniWindowExpanded(open)
})

// IPC cannot clone Vue proxies
function plainSelection(): TimerSelection {
    return JSON.parse(JSON.stringify(selection.value))
}

function onSelectionChanged() {
    if (isRunning.value && !isOnBreak.value) {
        window.electronAPI.updateRunningTimer(plainSelection())
    }
}

function onProjectChanged() {
    // Adopt the billable default of the picked project, like the main window does
    const project = projects.value?.find((p) => p.id === selection.value.project_id)
    if (project) {
        selection.value.billable = project.is_billable
    }
    onSelectionChanged()
}

const shownDescription = computed(() => {
    return selection.value.description ? selection.value.description : currentTask.value?.name
})
const currentTask = computed(() => {
    return tasks.value?.find((task) => task.id === selection.value.task_id)
})

watchEffect(() => {
    if (isRunning.value) {
        startLiveTimer()
    } else {
        stopLiveTimer()
    }
})

function focusMainWindow() {
    showMainWindow()
}

function onToggleButtonPress(newState: boolean) {
    if (newState) {
        window.electronAPI.startTimerWithSelection(plainSelection())
    } else {
        showMainWindow()
        sendEventToWindow('main', 'stopTimer')
    }
}

const currentTimer = computed(() => {
    if (liveTimer.value && currentTimeEntry.value.start) {
        const startTime = dayjs(currentTimeEntry.value.start)
        const diff = liveTimer.value.diff(startTime, 'seconds')
        return time.formatDuration(diff)
    }
    return '00:00:00'
})
</script>

<template>
    <div
        class="h-8 relative w-screen border-border-secondary border bg-primary rounded-[16px] text-white py-1 flex items-center cursor-default justify-between select-none">
        <div
            class="text-sm text-text-tertiary flex items-center relative min-w-0"
            :class="isOnBreak ? 'shrink-0' : 'flex-1'">
            <div class="pl-1 pr-1 z-20 relative block" style="-webkit-app-region: drag">
                <svg
                    class="h-5"
                    viewBox="0 0 25 25"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    data-tauri-drag-region>
                    <path
                        fill-rule="evenodd"
                        clip-rule="evenodd"
                        d="M9.5 8C10.3284 8 11 7.32843 11 6.5C11 5.67157 10.3284 5 9.5 5C8.67157 5 8 5.67157 8 6.5C8 7.32843 8.67157 8 9.5 8ZM9.5 14C10.3284 14 11 13.3284 11 12.5C11 11.6716 10.3284 11 9.5 11C8.67157 11 8 11.6716 8 12.5C8 13.3284 8.67157 14 9.5 14ZM11 18.5C11 19.3284 10.3284 20 9.5 20C8.67157 20 8 19.3284 8 18.5C8 17.6716 8.67157 17 9.5 17C10.3284 17 11 17.6716 11 18.5ZM15.5 8C16.3284 8 17 7.32843 17 6.5C17 5.67157 16.3284 5 15.5 5C14.6716 5 14 5.67157 14 6.5C14 7.32843 14.6716 8 15.5 8ZM17 12.5C17 13.3284 16.3284 14 15.5 14C14.6716 14 14 13.3284 14 12.5C14 11.6716 14.6716 11 15.5 11C16.3284 11 17 11.6716 17 12.5ZM15.5 20C16.3284 20 17 19.3284 17 18.5C17 17.6716 16.3284 17 15.5 17C14.6716 17 14 17.6716 14 18.5C14 19.3284 14.6716 20 15.5 20Z"
                        fill="currentColor"
                        data-tauri-drag-region />
                </svg>
            </div>
            <div class="rounded-lg flex items-center shrink min-w-0">
                <div
                    v-if="isOnBreak"
                    class="flex items-center shrink-0 space-x-1.5 text-xs font-medium whitespace-nowrap text-amber-600 dark:text-amber-400">
                    <Coffee class="w-3.5 h-3.5 shrink-0" />
                    <span>On break</span>
                </div>
                <div v-else class="flex items-center flex-1 space-x-0.5 min-w-0">
                    <TimeTrackerProjectTaskDropdown
                        v-model:project="selection.project_id"
                        v-model:task="selection.task_id"
                        v-model:open="projectPickerOpen"
                        variant="ghost"
                        size="xs"
                        align="start"
                        class="min-w-0 max-w-[140px] text-xs"
                        :projects="projects ?? []"
                        :tasks="tasks ?? []"
                        :clients="clients"
                        :createProject="createNothing"
                        :createClient="createNothing"
                        :canCreateProject="false"
                        currency=""
                        :organizationBillableRate="null"
                        :enableEstimatedTime="false"
                        @changed="onProjectChanged"></TimeTrackerProjectTaskDropdown>
                    <TimeTrackerTagDropdown
                        v-model="selection.tags"
                        v-model:open="tagPickerOpen"
                        showLabel
                        triggerClass="h-6 px-1.5 text-xs max-w-[110px]"
                        :tags="tags"
                        :createTag="createTag"
                        @changed="onSelectionChanged"></TimeTrackerTagDropdown>
                    <div
                        class="flex text-xs flex-1 truncate items-center space-x-0.5 shrink cursor-pointer"
                        @click="focusMainWindow">
                        <ChevronRightIcon
                            class="w-4 shrink-0 text-text-tertiary"></ChevronRightIcon>
                        <span
                            class="truncate shrink text-text-tertiary opacity-50 hover:opacity-100 transition-opacity min-w-0"
                            >{{ shownDescription ?? 'No Description' }}</span
                        >
                    </div>
                </div>
            </div>
            <div class="flex-1 h-6 w-full" style="-webkit-app-region: drag"></div>
        </div>

        <div
            class="pr-1 flex items-center space-x-1 min-w-0"
            :class="isOnBreak ? 'flex-1 justify-end pl-2' : ''">
            <button
                v-if="canResumeAfterBreak"
                type="button"
                class="flex min-w-0 shrink items-center gap-1 h-6 px-2 rounded-md bg-transparent border border-amber-500/40 hover:bg-amber-500/15 text-xs font-medium text-amber-600 dark:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 transition"
                @click="resumeAfterBreak">
                <Play class="w-3 h-3 shrink-0" />
                <span class="truncate">{{
                    resumeDescription ? `Resume "${resumeDescription}"` : 'Resume'
                }}</span>
            </button>
            <div
                class="text-xs font-semibold text-text-tertiary px-2 w-[65px] shrink-0 text-left"
                style="-webkit-app-region: drag">
                {{ currentTimer }}
            </div>
            <button
                v-if="breaksEnabled && !isOnBreak && isRunning"
                type="button"
                title="Take a break"
                aria-label="Take a break"
                class="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-quaternary text-text-tertiary hover:text-amber-500 focus:ring-2 focus:ring-border-tertiary transition"
                @click="startBreak">
                <Coffee class="w-3.5 h-3.5" />
            </button>
            <TimeTrackerStartStop
                class="shrink-0"
                :active="isRunning"
                :variant="isOnBreak ? 'break' : 'primary'"
                size="small"
                @changed="onToggleButtonPress"></TimeTrackerStartStop>
        </div>
    </div>
</template>

<style scoped></style>
