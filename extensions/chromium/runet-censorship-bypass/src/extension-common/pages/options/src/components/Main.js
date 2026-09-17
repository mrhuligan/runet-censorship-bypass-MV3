import Inferno, {linkEvent} from 'inferno';
import Component from 'inferno-component';
import createElement from 'inferno-create-element';
import css from 'csjs-inject';

import getTabPanel from './TabPanel';
import getPacChooser from './PacChooser';
import getExceptions from './Exceptions';
import getModList from './ModList';
import getProxyEditor from './ProxyEditor';
import getApplyMods from './ApplyMods';
import getNotifications from './Notifications';
import getYouboostEditor from './YouboostEditor';

export default function getMain(theState) {

  const scopedCss = css`

    input#ifProxyHttpsUrlsOnly:checked + div {
      color: red;
    }

  `;

  const TabPanel = getTabPanel(theState);

  const PacChooser = getPacChooser(theState);
  const Exceptions = getExceptions(theState);
  const ModList = getModList(theState);
  const ProxyEditor = getProxyEditor(theState);
  const YouboostEditor = getYouboostEditor(theState);
  const ApplyMods = getApplyMods(theState);
  const Notifications = getNotifications(theState);

  const checksName = 'pacMods';
  let selection = [0, 0]; // TODO: dirty hack but seems ok.

  /*
    MV3: modifier configs arrive with the connect-time snapshot (see
    90-rpc-server.js -> buildOwnProperties), because the page can no longer
    reach into the worker synchronously.
  */
  const snapshotCats = (props) => (props.state && props.state.orderedConfigs) || {};

  return class Main extends Component {

    constructor(props) {

      super(props);
      const cats = snapshotCats(props);
      this.state = {
        ifModsChangesAreStashed: false,
        ifModsChangesAreValid: true,
        catToOrderedMods: {
          'general': cats.general || [],
          'ownProxies': cats.ownProxies || [],
        },
      };
      this.handleModChange = this.handleModChange.bind(this);

    }

    /*
      MV3: the parent re-fetches the worker snapshot after every mutation and
      updates props.state. Re-sync the editable config lists so the form shows
      the actual applied state (including worker-side corrections) without
      requiring the popup to be reopened.
    */
    componentWillReceiveProps(nextProps) {

      if (!nextProps.state || nextProps.state === this.props.state) {
        return;
      }
      const cats = snapshotCats(nextProps);
      this.setState({
        catToOrderedMods: {
          'general': cats.general || [],
          'ownProxies': cats.ownProxies || [],
        },
        ifModsChangesAreStashed: false,
        ifModsChangesAreValid: true,
      });

    }

    getAllMods() {

      return [].concat(...Object.keys(this.state.catToOrderedMods).map((cat) =>
        this.state.catToOrderedMods[cat]
      ))

    }

    async handleModApply(that) {

      if (!that.state.ifModsChangesAreValid) {
        // Error message must be already set by a config validator.
        return;
      }
      const modsMutated = await that.props.apis.pacKitchen.getPacModsAsync();
      const newMods = that.getAllMods().reduce((_, conf) => {

        modsMutated[conf.key] = conf.value;
        return modsMutated;

      }, modsMutated/* Needed for index 0*/);
      that.props.funs.conduct(
        'Применяем настройки...',
        () => that.props.apis.pacKitchen.keepCookedNowAsyncPromise(newMods),
        'Настройки применены.',
        () => that.setState({
          ifModsChangesAreStashed: false,
          ifModsChangesAreValid: true,
        })
      );

    }

    handleModChange({ifValid, targetConf, targetIndex, newValue}) {

      if (ifValid === undefined) {
        // User input some data, but not validated yet.
        this.setState({
          // Make apply button clickable when user only starts writing.
          ifModsChangesAreStashed: true,
        });
        return;
      }
      if (ifValid === false) {
        this.setState({
          ifModsChangesAreValid: false,
          ifModsChangesAreStashed: true,
        })
        return;
      }
      const oldCats = this.state.catToOrderedMods;
      const newCats = Object.keys(this.state.catToOrderedMods).reduce((acc, cat) => {

        if (cat !== targetConf.category) {
          acc[cat] = oldCats[cat];
        } else {
          acc[cat] = oldCats[cat].map((conf, index) => {

            if (targetIndex !== index) {
              return conf;
            }
            return Object.assign({}, conf, {
              value: newValue
            });

          });
        }
        return acc;

      }, {});

      this.setState({
        catToOrderedMods: newCats,
        ifModsChangesAreStashed: true,
        ifModsChangesAreValid: true,
      });

    }

    render(props) {

      const applyModsEl = createElement(ApplyMods, Object.assign({}, props,
        {
          ifInputsDisabled: !this.state.ifModsChangesAreStashed || props.ifInputsDisabled,
          onClick: linkEvent(this, this.handleModApply),
        }
      ));

      const modsHandlers = {
        onConfChanged: this.handleModChange,
      };

      return createElement(TabPanel, Object.assign({}, props, {
        tabs: [
          {
            label: chrome.i18n.getMessage('PAC_script'),
            content: createElement(PacChooser, props),
            key: 'pacScript',
          },
          {
            label: chrome.i18n.getMessage('Exceptions'),
            content: createElement(Exceptions, props),
            key: 'exceptions',
          },
          {
            label: chrome.i18n.getMessage('Own_proxies'),
            content: createElement(
              ModList,
              Object.assign({}, props, {
                orderedConfigs: this.state.catToOrderedMods['ownProxies'],
                childrenOfMod: {
                  customProxyStringRaw: ProxyEditor,
                  ifUseYouboost: YouboostEditor,
                  replaceDirectWith: ({ conf, onNewValue, ifInputsDisabled }) =>
                    (<input
                      style="width: 100%; margin: 0.5em 0"
                      disabled={ifInputsDisabled}
                      value={conf.value || ''}
                      onInput={(event) => {

                        const t = event.target;
                        selection = [t.selectionStart, t.selectionEnd];
                        onNewValue(true, t.value);
                      }}
                      ref={(input) => {

                        if (input) {
                          input.focus();
                          input.selectionStart = selection[0];
                          input.selectionEnd = selection[1];
                        }
                      }}
                    />),
                },
                name: checksName,
              }, modsHandlers)
            ),
            key: 'ownProxies',
          },
          {
            label: chrome.i18n.getMessage('Modifiers'),
            content: createElement(
              ModList,
              Object.assign({}, props, {
                orderedConfigs: this.state.catToOrderedMods['general'],
                name: checksName,
              }, modsHandlers)
            ),
            key: 'mods',
          },
          {
            content: applyModsEl,
            key: 'applyMods',
          },
          {
            label: chrome.i18n.getMessage('Notifications'),
            content: createElement(Notifications, props),
            key: 'notifications',
          },
        ],
        alwaysShownWith: {
          'applyMods': ['ownProxies', 'mods'],
        },
      }));

    }

  }

};
