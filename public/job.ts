interface JobDetail {
  jobId: string;
  originalName: string;
  transparent: string[];
  opaque: string[];
}

const jobId = new URLSearchParams(location.search).get('id');

const renderGrid = (container: HTMLElement, subfolder: string, files: string[]): void => {
  container.innerHTML = '';

  for (const filename of files) {
    const src = `/jobs/${jobId}/files/${subfolder}/${filename}`;
    const wrapper = document.createElement('div');

    wrapper.innerHTML = `
      <img src="${src}" loading="lazy" alt="${filename}" />
      <div>
        <a href="${src}" download>Download</a>
        <button>Delete</button>
      </div>
    `;

    const deleteButton = wrapper.querySelector('button') as HTMLButtonElement;

    deleteButton.addEventListener('click', async () => {
      await fetch(`/jobs/${jobId}/files/${subfolder}/${filename}`, { method: 'DELETE' });
      wrapper.remove();
    });
    container.appendChild(wrapper);
  }
};

const jobTitle = document.getElementById('job-title') as HTMLHeadingElement;
const downloadAll = document.getElementById('download-all') as HTMLAnchorElement;
const transparentGrid = document.getElementById('transparent-grid') as HTMLDivElement;
const opaqueGrid = document.getElementById('opaque-grid') as HTMLDivElement;
const deleteJobButton = document.getElementById('delete-job') as HTMLButtonElement;

const load = async (): Promise<void> => {
  const res = await fetch(`/jobs/${jobId}`);
  const job = (await res.json()) as JobDetail;

  jobTitle.textContent = job.originalName;
  downloadAll.href = `/jobs/${jobId}/download`;
  renderGrid(transparentGrid, 'transparent', job.transparent || []);
  renderGrid(opaqueGrid, 'opaque', job.opaque || []);
};

deleteJobButton.addEventListener('click', async () => {
  if (!confirm('Delete this job?')) {
    return;
  }

  await fetch(`/jobs/${jobId}`, { method: 'DELETE' });
  location.href = '/jobs.html';
});

load();
