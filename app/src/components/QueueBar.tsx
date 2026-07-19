import { ActionIcon, Badge, Group, Loader, Tooltip } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useQueue, type Job, type JobStatus } from '../lib/queue'

function elapsedSeconds(job: Job, now: number): number {
  const end = job.finishedAt ?? now
  return Math.max(0, Math.round((end - job.startedAt) / 1000))
}

function statusColor(status: JobStatus): string {
  if (status === 'done') return 'teal'
  if (status === 'error') return 'red'
  if (status === 'cancelled') return 'gray'
  return 'blue'
}

type QueueBarItemProps = {
  job: Job
  now: number
  onCancel: () => void
  onDismiss: () => void
}

function QueueBarItem({ job, now, onCancel, onDismiss }: QueueBarItemProps) {
  const running = job.status === 'running'
  const seconds = elapsedSeconds(job, now)
  const color = statusColor(job.status)

  const badge = (
    <Badge
      size="lg"
      variant="light"
      color={color}
      style={{
        cursor: running ? 'default' : 'pointer',
        textTransform: 'none',
        maxWidth: 320,
      }}
      onClick={running ? undefined : onDismiss}
      leftSection={running ? <Loader size={10} color={color} /> : undefined}
      rightSection={
        running ? (
          <ActionIcon
            size="xs"
            variant="transparent"
            color="red"
            onClick={(event) => {
              event.stopPropagation()
              onCancel()
            }}
            aria-label="Cancel generation"
          >
            ✕
          </ActionIcon>
        ) : undefined
      }
    >
      {job.label || '(untitled)'} · {seconds}s
    </Badge>
  )

  if (job.status === 'error' && job.error) {
    return <Tooltip label={job.error}>{badge}</Tooltip>
  }

  return badge
}

/**
 * Compact horizontal strip of in-flight and recent generate/edit jobs, rendered directly below
 * the app header — outside the view switch, so it stays visible on every tab. Renders nothing
 * when the queue is empty.
 */
export function QueueBar() {
  const { jobs, cancel, dismiss } = useQueue()
  const [now, setNow] = useState(() => Date.now())
  const hasRunning = jobs.some((job) => job.status === 'running')

  useEffect(() => {
    if (!hasRunning) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [hasRunning])

  if (jobs.length === 0) return null

  return (
    <Group
      gap="xs"
      px="md"
      py="xs"
      wrap="wrap"
      style={{ borderBottom: '1px solid var(--vx-surface-border)', flexShrink: 0 }}
    >
      {jobs.map((job) => (
        <QueueBarItem
          key={job.id}
          job={job}
          now={now}
          onCancel={() => cancel(job.id)}
          onDismiss={() => dismiss(job.id)}
        />
      ))}
    </Group>
  )
}
