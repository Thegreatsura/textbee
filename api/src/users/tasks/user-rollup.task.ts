import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { UserRollupService } from '../user-rollup.service'

// Keeps user.rollup honest for accounts whose devices or API keys changed
// without the change path running, and repairs anything a failed write left
// behind.
//
// Note there is no distributed lock anywhere in this app: the existing crons
// rely on pm2 running a single instance in fork mode. If that ever changes this
// job will double-run. It is idempotent, so a double run wastes reads rather
// than corrupting anything, but it is not a licence to scale out.
@Injectable()
export class UserRollupTask {
  private readonly logger = new Logger(UserRollupTask.name)

  constructor(private readonly rollup: UserRollupService) {}

  // 04:20, away from the 06:00 webhook sweep so the two do not overlap.
  @Cron('0 20 4 * * *')
  async recomputeRollups() {
    const startedAt = Date.now()
    try {
      const processed = await this.rollup.recomputeAll({ batchSize: 500 })
      this.logger.log(
        `Recomputed ${processed} user rollups in ${Date.now() - startedAt}ms`,
      )
    } catch (error) {
      // Swallowed on purpose: a failed sweep must not take the process down, and
      // the next run repeats the whole job anyway.
      this.logger.error(`User rollup sweep failed: ${error?.message ?? error}`)
    }
  }
}
