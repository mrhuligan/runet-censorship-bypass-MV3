import Inferno from 'inferno';
import Component from 'inferno-component';
import createElement from 'inferno-create-element';
import css from 'csjs-inject';

import getLastUpdateDate from './LastUpdateDate';
import getInfoLi from './InfoLi';

export default function getPacChooser(theState) {

  const scopedCss = css`
    /* OTHER VERSION */

    .otherVersion {
      font-size: 1.7em;
      color: var(--ribbon-color);
      margin-left: 0.1em;
    }
    .otherVersion:hover {
      text-decoration: none;
    }
    .fullLineHeight,
    .fullLineHeight * {
      line-height: 100%;
    }

    /* TAB_1: PAC PROVIDER */

    .updateButton {
      visibility: hidden;
      margin-left: 0.5em;
    }
    input:checked + div .updateButton {
      visibility: inherit;
    }
    label[for="onlyOwnSites"] + .updateButton,
    label[for="none"] + .updateButton {
      display: none;
    }
    #none:checked + div label[for="none"] {
      color: red;
    }

    #updateMessage {
      white-space: nowrap;
      margin-top: 0.5em;
    }

  `;

  const LastUpdateDate = getLastUpdateDate(theState);
  const InfoLi = getInfoLi(theState);

  return class PacChooser extends Component {

    constructor(props) {

      super(props);
      /*
        The selected provider is read from the live worker snapshot, so no
        local mirror state is needed: after a mutation App calls
        reloadState() and re-renders, and getCurrentProviderId() below returns
        the freshly applied key.
      */
      this.updatePac = function updatePac(onSuccess) {
        props.funs.conduct(
          chrome.i18n.getMessage('UpdatingDDD'),
          () => theState.apis.antiCensorRu.syncWithPacProviderAsyncPromise({}),
          chrome.i18n.getMessage('UpdatedD'),
          onSuccess
        );
      };
      this.radioClickHandler = this.radioClickHandler.bind(this);
      this.updateClickHandler = this.updateClickHandler.bind(this);

    }

    getCurrentProviderId() {

      return theState.state.currentPacProviderKey || 'none';

    }

    updateClickHandler(event) {

      event.preventDefault();
      this.updatePac();

    }

    radioClickHandler(event) {

      const pacKey = event.target.id;
      if (pacKey === this.getCurrentProviderId()) {
        return false;
      }
      if (pacKey === 'none') {
        this.props.funs.conduct(
          chrome.i18n.getMessage('DisablingDDD'),
          () => theState.apis.antiCensorRu.clearPacAsyncPromise(),
          chrome.i18n.getMessage('DisabledD')
        );
      } else {
        this.props.funs.conduct(
          chrome.i18n.getMessage('InstallingDDD'),
          () => theState.apis.antiCensorRu.installPacAsyncPromise(pacKey),
          chrome.i18n.getMessage('PacScriptWasInstalledD')
        );
      }
      return false;

    }

    render(props) {

      const iddyToCheck = this.getCurrentProviderId();
      /*
        MV3: the provider list ships in the connect-time snapshot (it is
        static data), so no async fetch is needed during render.
      */
      const providers = theState.state.sortedProviders || [];
      return (
        <div>
          {props.flags.ifInsideOptionsPage && (<header>{chrome.i18n.getMessage('PAC_script')}:</header>)}
          <ul>
            {
              [...providers, {key: 'none', label: chrome.i18n.getMessage('Disable')}].map((provConf) =>
                (<InfoLi
                  onClick={this.radioClickHandler}
                  conf={provConf}
                  type="radio"
                  name="pacProvider"
                  checked={iddyToCheck === provConf.key}
                  ifInputsDisabled={props.ifInputsDisabled}
                  nodeAfterLabel={<a href="" class={scopedCss.updateButton} onClick={this.updateClickHandler}>[{chrome.i18n.getMessage('update')}]</a>}
                />)
              )
            }
          </ul>
          <div id="updateMessage" class="horFlex" style="align-items: center">
            { createElement(LastUpdateDate, props) }
            <div class={scopedCss.fullLineHeight}>
              {
                props.flags.ifMini
                  ? (<a class={scopedCss.otherVersion + ' emoji'} href="https://github.com/anticensority/runet-censorship-bypass/wiki/Различные-версии-расширения"
                      title={chrome.i18n.getMessage("FullVersion")}>🏋</a>)
                  : (<a class={scopedCss.otherVersion + ' emoji'} href="https://github.com/anticensority/runet-censorship-bypass/wiki/Различные-версии-расширения"
                      title={chrome.i18n.getMessage("VersionForSlowMachines")}>🐌</a>)
              }
            </div>
          </div>
        </div>
      );

    }

    componentDidMount() {

      if (theState.state.ifFirstInstall) {
        this.updatePac();
      }

    }

  };

};
