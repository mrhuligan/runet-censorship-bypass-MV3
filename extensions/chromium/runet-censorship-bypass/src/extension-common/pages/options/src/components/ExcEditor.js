import Inferno from 'inferno';
import Component from 'inferno-component';
import css from 'csjs-inject';

export default function getExcEditor(theState) {

  const scopedCss = css`

    #exc-address-container {
      display: flex;
      align-items: center;
      width: 100%;
    }
    #exc-address-container > a {
      border-bottom: 1px solid transparent;
      margin-left: 0.2em;
      align-self: flex-end;
    }
    #exc-address {
      width: 100%;
      display: flex;
      align-items: baseline;
      --exc-hieght: 1.6em;
      font-size: 1em;
      border-bottom: 1px solid var(--ribbon-color) !important;
    }
    input#exc-editor {
      border: none;
      width: 100%;
      background: inherit;
      /* The two below align '.' (dot) vertically. */
      max-height: var(--exc-hieght) !important;
      min-height: var(--exc-hieght) !important;
    }
    #exc-radio {
      display: flex;
      justify-content: space-around;
      margin-top: 0.5em;
    }
    [name="if-proxy-this-site"]:checked + label {
      font-weight: bold;
    }
    #exc-address.ifYes {
      background-color: lightgreen;
    }
    #exc-address.ifNo {
      background-color: pink;
    }

  `;

  const labelIfProxied = '✔';
  const labelIfNotProxied = '✘';
  const labelIfAuto = '↻';

  /* Not used.
  const sortOptions = (options) => {

    const aWins = 1;
    return options.sort(([aHost, aState], [bHost, bState]) => aState === undefined ? aWins : aHost.localeCompare(bHost))

  };
  */

  return class ExcEditor extends Component {

    modsToOpts(pacMods) {

      return Object.keys(pacMods.exceptions || {}).sort().map(
        (excHost) => [excHost, pacMods.exceptions[excHost]]
      );

    }

    constructor(props) {

      super(props);
      const trimmedInputValueOrSpace =
        props.currentTab &&
        props.currentTab.url &&
        !props.currentTab.url.startsWith('chrome')
          ? '*.' + (new URL(props.currentTab.url).hostname.replace(/^www\./g, ''))
          : '';

      /*
        MV3: pacMods arrive in the connect-time snapshot, so the editor can
        render immediately. Live refreshes happen in componentDidMount.
      */
      const pacMods = (props.state && props.state.pacMods) || { exceptions: {} };
      this.state = {
        trimmedInputValueOrSpace,
        sortedListOfOptions: this.modsToOpts(pacMods),
        hostToIfHidden: {},
      };
      this.handleRadioClick = this.handleRadioClick.bind(this);
      this.handleInputOrClick = this.handleInputOrClick.bind(this);

    }

    async componentDidMount() {

      const pacMods = await this.props.apis.pacKitchen.getPacModsAsync();
      this.setState({ sortedListOfOptions: this.modsToOpts(pacMods) });

    }

    hideAllOptions() {

      this.setState({
        hostToIfHidden: this.state.sortedListOfOptions.reduce(
          (hostToIfHidden, [excHost]) => {

            hostToIfHidden[excHost] = true;
            return hostToIfHidden;

          },
        {}),
      });

    }

    isHostValid(host) {

      const ValidHostnameRegex = /^(?:\*\.)?(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;
      if(!ValidHostnameRegex.test(host)) {
        this.props.funs.showErrors(new TypeError('Должно быть только доменное имя, без протокола, порта и пути. Попробуйте ещё раз.'));
        return false;
      }
      return true;

    }

    handleRadioClick(event) {

      const host = this.state.trimmedInputValueOrSpace;
      (async () => { // Async IIFE: the bridge is promise-based.

        if(!this.isHostValid(host)) {
          return false;
        }

        const pacMods = await this.props.apis.pacKitchen.getPacModsAsync();
        pacMods.exceptions = pacMods.exceptions || {};

        let ifYesClicked = false;
        switch(event.target.id) {
          case 'this-auto':
            delete pacMods.exceptions[host];
            break;

          case 'this-yes':
            ifYesClicked = true;
          case 'this-no':
            if (ifYesClicked && !pacMods.filteredCustomsString) {
              this.props.funs.showErrors( new TypeError(
                chrome.i18n.getMessage('noOwnProxiesError'),
              ));
              return false;
            }

            pacMods.exceptions[host] = ifYesClicked;
            break;

          default:
            throw new Error('Only yes/no/auto!');
        }

        this.props.funs.conduct(
          'Применяем исключения...',
          () => this.props.apis.pacKitchen.keepCookedNowAsyncPromise(pacMods),
          'Исключения применены. Не забывайте о кэше!',
          async () => {
            await this.props.funs.reloadState();
            this.setState({sortedListOfOptions: this.modsToOpts(pacMods)});
          }
        );

      })();
      // Don't check before operation is finished.
      event.preventDefault();

    }

    handleKeyDown(event) {

      if(event.key === 'Enter') {
        this.hideAllOptions();
      }
      return true;

    }

    handleInputOrClick(event) {

      // Episode 1.

      const ifClick = event && event.type === 'click';

      // If triangle button on right of datalist input clicked.
      let ifTriangleClicked = false;
      {
        const maxIndentFromRightInPx = 15;
        ifTriangleClicked = ifClick
          && !this.rawInput.selectionStart && !this.rawInput.selectionEnd
          && event.x > this.rawInput.getBoundingClientRect().right - maxIndentFromRightInPx;
      }

      const setInputValue = (newValue) => {

        if (ifClick && !ifTriangleClicked) {
          // Don't jerk cursor on simple clicks.
          return;
        }
        // See bug in my comment to http://stackoverflow.com/a/32394157/521957
        // First click on empty input may be still ignored.
        const newPos = this.rawInput.selectionStart + newValue.length - this.rawInput.value.length;
        this.rawInput.value = newValue;
        window.setTimeout(() => this.rawInput.setSelectionRange(newPos, newPos), 0);

      };

      const trimmedInput = event.target.value.trim();
      const ifInputEmpty = !trimmedInput;
      const ifInit = !event;
      const currentHost = ifTriangleClicked ? '' : (trimmedInput || (ifInit ? '' : ' '));
      setInputValue(currentHost);
      this.setState({
        trimmedInputValueOrSpace: currentHost,
      });

      // Episode 2.

      let exactHost, exactState; // Undefined.
      let editedHost = false;
      const hidden = this.state.sortedListOfOptions.reduce(
        (hiddenAcc, [excHost, excState]) => {

          if (excState === undefined) {
            editedHost = excHost;
          } else if (excHost === trimmedInput) {
            // Exact match found for input.
            [exactHost, exactState] = [excHost, excState];
          }
          hiddenAcc[excHost] = false;
          return hiddenAcc;

        },
        {}
      );
      let options = this.state.sortedListOfOptions;
      const removeEditedHost = () => {

        options = options.filter(([excHost, excState]) => editedHost !== excHost);
        delete hidden[editedHost];

      };


      (() => {// `return` === setState

        if (ifTriangleClicked || ifInputEmpty) {
          // Show all opts.
          if (editedHost) {
            // Example of editedOpt.value: 'abcde ' <- Mind the space (see unhideOptAndAddSpace)!
            const ifBackspacedOneChar = ifInputEmpty && editedHost.length < 3;
            if (ifBackspacedOneChar) {
              removeEditedHost();
            }
          }
          return true;
        }

        if (editedHost) {
          const ifUpdateNeeded = editedHost !== trimmedInput;
          if(!ifUpdateNeeded) {
            hidden[editedHost] = true;
            return true;
          }
          // Not exact! Update!
          removeEditedHost();
        }

        if (!exactHost) {
          editedHost = trimmedInput;
          options.unshift([editedHost, undefined]);
          if (!ifClick) {
            // New value was typed -- don't show tooltip.
            hidden[editedHost] = true;
          }
        }

        // Exact found!
        // Do nothing.

      })();

      this.setState({
        hostToIfHidden: hidden,
        sortedListOfOptions: options,
      });

    }

    render(props) {

      const inputProxyingState = this.state.sortedListOfOptions.reduce((acc, [excHost, excState]) => {

        if ( acc !== undefined ) {
          return acc;
        }
        return this.state.trimmedInputValueOrSpace === excHost ? excState : undefined;

      }, undefined);

      return (
        <section style="padding-bottom: 1em;">
          <div>{chrome.i18n.getMessage('ProxyTheDomainNameBelowQ')}</div>
          <div id="exc-address-container">
            <div id="exc-address" class={inputProxyingState !== undefined ? ( inputProxyingState === true ? scopedCss.ifYes : scopedCss.ifNo ) : ''}>
              <input placeholder="*.navalny.com" list="exc-list" id="exc-editor"
                value={this.state.trimmedInputValueOrSpace}
                ref={(inputNode) => { this.rawInput = inputNode; }}
                onKeyDown={this.handleKeyDown.bind(this)}
                onInput={this.handleInputOrClick}
                onClick={this.handleInputOrClick}
              />
            </div>
            {/*<a href class="emoji">⇄</a>*/}
            <a href="../exceptions/index.html" title="импорт/экспорт"><svg
              class="icon"
              ><use xlink:href="#iconImportExport"></use></svg>
            </a>
          </div>
          <datalist id="exc-list">
            {
              this.state.sortedListOfOptions.map(([excHost, excState]) => {

                // 1. Option's value may be changed to hide it from the tooltip.
                // 2. Space is used in matching so even an empty input (replaced with space) has tooltip with prompts.
                const ifProxy = excState;
                return <option
                  value={ this.state.hostToIfHidden[excHost] ? '\n' : excHost + ' ' }
                  label={ ifProxy === true ? labelIfProxied : (ifProxy === false ? labelIfNotProxied : labelIfAuto) }/>

              })
            }
          </datalist>
          <ol class="horizontalList middledChildren" id="exc-radio">
            <li><input id="this-auto" type="radio" checked name="if-proxy-this-site" onClick={this.handleRadioClick}/>{' '}
                  <label for="this-auto">{/*<span class="emoji">🔄(looks fat)</span>*/}<svg
                    class="icon"
                    style="position: relative; top: 0.15em;"><use xlink:href="#iconLoopRound"></use></svg>&nbsp;{chrome.i18n.getMessage('auto')}</label>
            </li>
            <li>
              <input id="this-yes" type="radio" name="if-proxy-this-site" checked={inputProxyingState === true} onClick={this.handleRadioClick}/>
              {' '}<label for="this-yes">
                    <span
                      class="emoji____buggy"
                    >✔</span>&nbsp;{chrome.i18n.getMessage('yes')}
                  </label>
            </li>
            <li>
              <input id="this-no" type="radio" name="if-proxy-this-site" checked={inputProxyingState === false} onClick={this.handleRadioClick}/>
              {' '}<label for="this-no"><span class="emoji">✘</span>&nbsp;{chrome.i18n.getMessage('no')}</label></li>
          </ol>
        </section>
      );

    }

  };

};
