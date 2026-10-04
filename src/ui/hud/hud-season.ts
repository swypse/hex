import { Container, BitmapText } from 'pixi.js';
import { t } from '../../i18n';
import { seasonForTurn, seasonTurn, SEASON_LENGTH } from '../../game/season';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { Popup, POPUP_BODY_SIZE } from '../kit/popup';
import { SCORE_PAD, SCORE_TEXT_Y } from '../layout';
import { FontSize } from '@enums';

const SEASON_FONT_SIZE = FontSize.NORMAL;

/** Current season label in the top-left corner, level with the score text.
 *  Tapping it opens a card explaining seasons and winter ice. */
export class HudSeason implements Widget {
  private text: BitmapText | null = null;
  private host: UIHost | null = null;
  private popup: Popup | null = null;
  private unsub: (() => void) | null = null;
  private lastLabel = '';

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const text = makeLabel('', { fontSize: SEASON_FONT_SIZE, fill: 0xffffff });
    text.anchor.set(0, 0.5);
    text.position.set(SCORE_PAD, SCORE_TEXT_Y);
    text.eventMode = 'static';
    text.cursor = 'pointer';
    text.on('pointertap', () => this.openPopup());
    root.addChild(text);
    this.text = text;
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
  }

  private update(): void {
    if (!this.text) return;
    const turn = useGameStore.getState().turn;
    const label = `${t(`season.${seasonForTurn(turn)}` as never)} ${seasonTurn(turn)}/${SEASON_LENGTH}`;
    if (label === this.lastLabel) return;
    this.lastLabel = label;
    this.text.text = label;
  }

  private openPopup(): void {
    if (!this.host) return;
    this.closePopup();
    const onDone = (): void => this.closePopup();
    const popup = new Popup({
      app: this.host.app,
      title: t('season.popup.title'),
      modal: false,
      width: 320,
      onClose: onDone,
      closeOnEscape: true,
      onTap: onDone,
    });
    const body = makeLabel(
      [
        t('season.popup.length', { turns: SEASON_LENGTH }),
        t('season.popup.winter'),
        t('season.popup.spring'),
      ].join('\n\n'),
      { fontSize: POPUP_BODY_SIZE, fill: 0xeeeeee, wordWrap: true, wordWrapWidth: popup.contentWidth },
    );
    body.position.set(0, 0);
    popup.content.addChild(body);
    this.host.overlayLayer.addChild(popup.el);
    popup.finish();
    this.popup = popup;
  }

  private closePopup(): void {
    this.popup?.destroy();
    this.popup = null;
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    this.closePopup();
    this.text?.destroy();
    this.text = null;
    this.host = null;
  }
}
