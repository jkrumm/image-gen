import type { EditResponse, GenerateResponse } from '@image-gen/shared'
import { notifications } from '@mantine/notifications'
import { error as logError } from '@tauri-apps/plugin-log'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { edit, generate, type EditFiles } from './gateway'
import {
  saveEdit,
  saveGeneration,
  type SaveEditRequest,
  type SaveGenerationRequest,
} from './library'
import type { Settings } from './settings'

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled'

export type Job = {
  id: string
  kind: 'generate' | 'edit'
  /** Short prompt excerpt for the queue bar. */
  label: string
  status: JobStatus
  startedAt: number
  finishedAt?: number
  /** Library id once persisted to disk. */
  savedId?: string
  error?: string
  /** The gateway response, once the job completes successfully — drives result display. */
  response?: GenerateResponse | EditResponse
}

type QueueContextValue = {
  jobs: readonly Job[]
  enqueueGenerate: (input: SaveGenerationRequest) => string
  enqueueEdit: (input: SaveEditRequest, images: File[], mask?: File) => string
  cancel: (id: string) => void
  dismiss: (id: string) => void
}

const QueueContext = createContext<QueueContextValue | null>(null)

const LABEL_MAX_LENGTH = 48

function labelFor(prompt: string): string {
  const trimmed = prompt.trim()
  return trimmed.length > LABEL_MAX_LENGTH ? `${trimmed.slice(0, LABEL_MAX_LENGTH)}…` : trimmed
}

type QueueProviderProps = {
  children: ReactNode
  settings: Settings
  onSaved: () => void
}

/**
 * Owns in-flight generate/edit jobs independent of which view is mounted. The fetch and the
 * `saveGeneration`/`saveEdit` call both live here, so a job started in Compose keeps running
 * (and, on completion, still gets written to disk) even after the user switches to Library or
 * Edit — nothing about a job's lifecycle is tied to a mounted component. Cancellation is
 * explicit-only, via `cancel(id)`; there is no unmount-triggered abort.
 */
export function QueueProvider({ children, settings, onSaved }: QueueProviderProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const controllersRef = useRef(new Map<string, AbortController>())

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)))
  }, [])

  const runGenerate = useCallback(
    async (id: string, input: SaveGenerationRequest, controller: AbortController) => {
      try {
        const response = await generate(settings, input, controller.signal)
        if (controller.signal.aborted) return
        const metadata = await saveGeneration(response, input)
        updateJob(id, { status: 'done', finishedAt: Date.now(), savedId: metadata.id, response })
        notifications.show({
          color: 'green',
          title: 'Generation saved',
          message: `Saved to library as ${metadata.id}`,
        })
        onSaved()
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        void logError(`generation failed: ${message}`)
        updateJob(id, { status: 'error', finishedAt: Date.now(), error: message })
        notifications.show({ color: 'red', title: 'Generation failed', message })
      } finally {
        controllersRef.current.delete(id)
      }
    },
    [settings, onSaved, updateJob],
  )

  const runEdit = useCallback(
    async (id: string, input: SaveEditRequest, files: EditFiles, controller: AbortController) => {
      try {
        const response = await edit(settings, input, files, controller.signal)
        if (controller.signal.aborted) return
        const metadata = await saveEdit(response, input, files)
        updateJob(id, { status: 'done', finishedAt: Date.now(), savedId: metadata.id, response })
        notifications.show({
          color: 'green',
          title: 'Edit saved',
          message: `Saved to library as ${metadata.id}`,
        })
        onSaved()
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : String(error)
        void logError(`edit failed: ${message}`)
        updateJob(id, { status: 'error', finishedAt: Date.now(), error: message })
        notifications.show({ color: 'red', title: 'Edit failed', message })
      } finally {
        controllersRef.current.delete(id)
      }
    },
    [settings, onSaved, updateJob],
  )

  const enqueueGenerate = useCallback(
    (input: SaveGenerationRequest): string => {
      const id = crypto.randomUUID()
      const controller = new AbortController()
      controllersRef.current.set(id, controller)
      setJobs((prev) => [
        ...prev,
        {
          id,
          kind: 'generate',
          label: labelFor(input.prompt),
          status: 'running',
          startedAt: Date.now(),
        },
      ])
      void runGenerate(id, input, controller)
      return id
    },
    [runGenerate],
  )

  const enqueueEdit = useCallback(
    (input: SaveEditRequest, images: File[], mask?: File): string => {
      const id = crypto.randomUUID()
      const controller = new AbortController()
      controllersRef.current.set(id, controller)
      const files: EditFiles = { images, ...(mask ? { mask } : {}) }
      setJobs((prev) => [
        ...prev,
        {
          id,
          kind: 'edit',
          label: labelFor(input.prompt),
          status: 'running',
          startedAt: Date.now(),
        },
      ])
      void runEdit(id, input, files, controller)
      return id
    },
    [runEdit],
  )

  // Explicit user cancel only — never wired to unmount. `abort()` here is forwarded into
  // `generate`/`edit` (via `controller.signal`), which plugin-http's `fetch` honors — the
  // in-flight upstream request is genuinely cancelled, not just abandoned. `abort()` also
  // flips `controller.signal.aborted` synchronously, which the runner checks before
  // persisting and in its catch block — so a cancelled job's result is discarded on arrival
  // and the resulting fetch rejection doesn't surface as a red "failed" notification.
  const cancel = useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort()
      updateJob(id, { status: 'cancelled', finishedAt: Date.now() })
    },
    [updateJob],
  )

  const dismiss = useCallback((id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id))
  }, [])

  const value = useMemo<QueueContextValue>(
    () => ({ jobs, enqueueGenerate, enqueueEdit, cancel, dismiss }),
    [jobs, enqueueGenerate, enqueueEdit, cancel, dismiss],
  )

  return createElement(QueueContext.Provider, { value }, children)
}

export function useQueue(): QueueContextValue {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue must be used within a QueueProvider')
  return ctx
}
