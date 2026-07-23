import { confirmDialog } from './lib/confirmDialog';
import { icon } from './lib/icons';
import { formatBytes, formatDate } from './lib/format';

interface JobSummary {
  jobId: string;
  originalName: string;
  uploadedAt: string;
  status: string;
  transparentCount?: number;
  opaqueCount?: number;
  totalSize?: number;
}

type SortKey = 'originalName' | 'uploadedAt' | 'status' | 'images' | 'size';

const STATUS_BADGE_CLASS: Record<string, string> = {
  done: 'badge-done',
  error: 'badge-error',
  processing: 'badge-running',
};

const tbody = document.querySelector('#jobs-table tbody') as HTMLTableSectionElement;
const statusFilter = document.getElementById('status-filter') as HTMLSelectElement;
const headers = document.querySelectorAll<HTMLTableCellElement>('#jobs-table th[data-sort]');

let allJobs: JobSummary[] = [];
let sortKey: SortKey = 'uploadedAt';
let sortDir: 'asc' | 'desc' = 'desc';

const imageCount = (job: JobSummary): number =>
  (job.transparentCount || 0) + (job.opaqueCount || 0);

const sortValue = (job: JobSummary, key: SortKey): string | number => {
  if (key === 'images') {
    return imageCount(job);
  }

  if (key === 'size') {
    return job.totalSize || 0;
  }

  if (key === 'uploadedAt') {
    return new Date(job.uploadedAt).getTime();
  }

  return job[key].toLowerCase();
};

const applyFilterAndSort = (): JobSummary[] => {
  const filtered =
    statusFilter.value === 'all'
      ? allJobs
      : allJobs.filter((job) => job.status === statusFilter.value);

  return [...filtered].sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);

    if (va < vb) {
      return sortDir === 'asc' ? -1 : 1;
    }

    if (va > vb) {
      return sortDir === 'asc' ? 1 : -1;
    }

    return 0;
  });
};

const renderHeaders = (): void => {
  headers.forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');

    if (th.dataset.sort === sortKey) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
};

const render = (): void => {
  renderHeaders();
  tbody.innerHTML = '';

  for (const job of applyFilterAndSort()) {
    const badgeClass = STATUS_BADGE_CLASS[job.status] ?? 'badge-running';
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><a href="/job.html?id=${job.jobId}">${job.originalName}</a></td>
      <td>${formatDate(job.uploadedAt)}</td>
      <td><span class="badge ${badgeClass}">${job.status}</span></td>
      <td class="col-center">${imageCount(job)}</td>
      <td class="col-center">${job.totalSize ? formatBytes(job.totalSize) : '—'}</td>
      <td>
        <a href="/jobs/${job.jobId}/download" class="btn btn-secondary" title="Download zip" aria-label="Download zip">${icon('download')}</a>
        <button data-id="${job.jobId}" class="btn btn-danger delete-button" title="Delete" aria-label="Delete">${icon('trash')}</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.delete-button').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog('Delete this job and all of its images?', 'Delete job'))) {
        return;
      }

      const jobId = (button as HTMLElement).dataset.id;

      await fetch(`/jobs/${jobId}`, { method: 'DELETE' });
      await loadJobs();
    });
  });
};

const loadJobs = async (): Promise<void> => {
  const res = await fetch('/jobs');

  allJobs = (await res.json()) as JobSummary[];
  render();
};

headers.forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort as SortKey;

    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }

    render();
  });
});

statusFilter.addEventListener('change', render);

loadJobs();
