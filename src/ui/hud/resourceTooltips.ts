import { t } from '../../i18n';

export interface ResourceTooltipInfo {
  name: string;
  requiredFor: string;
}

export const RESOURCE_TOOLTIPS: Record<'money' | 'wood' | 'stone' | 'ore', ResourceTooltipInfo> = {
  money: { name: t('res.money'), requiredFor: t('res.req.money') },
  wood: { name: t('res.wood'), requiredFor: t('res.req.wood') },
  stone: { name: t('res.stone'), requiredFor: t('res.req.stone') },
  ore: { name: t('res.ore'), requiredFor: t('res.req.ore') },
};
