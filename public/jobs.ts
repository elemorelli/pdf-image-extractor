interface JobSummary {
  jobId: string;
  originalName: string;
  uploadedAt: string;
  status: string;
  transparentCount?: number;
  opaqueCount?: number;
}

const loadJobs = async (): Promise<void> => {
  const res = await fetch('/jobs');
  const jobs = (await res.json()) as JobSummary[];
  const tbody = document.querySelector('#jobs-table tbody') as HTMLTableSectionElement;

  tbody.innerHTML = '';

  for (const job of jobs) {
    const imageCount = (job.transparentCount || 0) + (job.opaqueCount || 0);
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><a href="/job.html?id=${job.jobId}">${job.originalName}</a></td>
      <td>${new Date(job.uploadedAt).toLocaleString()}</td>
      <td>${job.status}</td>
      <td>${imageCount}</td>
      <td>
        <a href="/jobs/${job.jobId}/download">Download zip</a>
        <button data-id="${job.jobId}" class="delete-button">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.delete-button').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this job?')) {
        return;
      }

      const jobId = (button as HTMLElement).dataset.id;

      await fetch(`/jobs/${jobId}`, { method: 'DELETE' });
      await loadJobs();
    });
  });
};

loadJobs();
