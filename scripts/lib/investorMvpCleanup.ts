import { Queue } from 'bullmq';

type RemovableQueue = Pick<Queue, 'remove' | 'getJob'>;

export async function removeQueueJobStrict(
  queue: RemovableQueue,
  id: string,
): Promise<void> {
  await queue.remove(id, { removeChildren: false });
  if (await queue.getJob(id)) {
    throw new Error(`job ${id} is still present after removal`);
  }
}

export async function removeOwnedQueueJobStrict(
  queue: RemovableQueue,
  id: string,
  tenantId: string,
): Promise<void> {
  const job = await queue.getJob(id);
  if (!job) return;
  if (job.data?.tenantId !== tenantId) {
    throw new Error('refusing to remove a job not owned by the current run');
  }
  await removeQueueJobStrict(queue, id);
}