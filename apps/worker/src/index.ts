import { workerJobs } from './jobs'

function main() {
  console.log('Anstoss worker foundation')
  console.log(
    JSON.stringify(
      {
        jobs: workerJobs,
        mode: 'foundation',
      },
      null,
      2,
    ),
  )
}

main()
