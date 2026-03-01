import type { TalentProvider } from '@/lib/talent-connectors/types'
import { TALENT_PROVIDERS } from '@/lib/talent-connectors/types'

import { fiverrProviderPlugin } from './fiverr'
import { taskrabbitProviderPlugin } from './taskrabbit'
import { thumbtackProviderPlugin } from './thumbtack'
import type { TalentProviderPlugin } from './types'
import { upworkProviderPlugin } from './upwork'

const talentProviderPlugins: Record<TalentProvider, TalentProviderPlugin<unknown>> = {
  upwork: upworkProviderPlugin,
  thumbtack: thumbtackProviderPlugin,
  taskrabbit: taskrabbitProviderPlugin,
  fiverr: fiverrProviderPlugin,
}

export function listTalentProviderPlugins(): Array<TalentProviderPlugin<unknown>> {
  return TALENT_PROVIDERS.map((id) => talentProviderPlugins[id])
}

export function listTalentProviderDescriptors() {
  return listTalentProviderPlugins().map((plugin) => plugin.descriptor)
}

export function getTalentProviderPlugin(provider: TalentProvider): TalentProviderPlugin<unknown> {
  return talentProviderPlugins[provider]
}
