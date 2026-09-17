// @flow

import css from 'csjs-inject';
import Inferno from 'inferno';

export default function getNotControlledWarning({ flags }) {

  const cssClasses = css`

    .warningContainer {
      background-color: red;
      color: white;
      font-weight: bold;
      text-align: center;

      ${ flags.ifInsideOptionsPage
          ? `
        padding-top: 0;
        padding-bottom: 0;
        ` : `
        padding-top: 1em;
        padding-bottom: 1em;
        `
      }

      border-bottom: 1px solid var(--default-grey);
    }
    .warningContainer a {
      color: white;
    }
  `;

  return function NotControlledWarning(props) {

    /*
      MV3: the warning HTML is pre-rendered by the worker and shipped in the
      connect-time snapshot; calling through the RPC proxy during render is
      not possible (render is synchronous).
    */
    const html = (props.state && props.state.whichExtensionHtml) || '';
    return (
      <section class={cssClasses.warningContainer + " horPadded"} dangerouslySetInnerHTML={{ __html: html }} />
    );

  }

}
