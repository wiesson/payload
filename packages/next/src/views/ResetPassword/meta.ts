import type { GenerateViewMetadata } from '../Root/index.js'

import { meta } from '../../utilities/meta.js'

export const generateResetPasswordMetadata: GenerateViewMetadata = async ({
  config,
  i18n: { t },
}) => {
  return meta({
    config,
    description: t('authentication:resetPassword'),
    keywords: t('authentication:resetPassword'),
    title: t('authentication:resetPassword'),
  })
}