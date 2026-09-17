import Inferno from 'inferno';
import Component from 'inferno-component';
import css from 'csjs-inject';

/*
  UI for the YouBoost provider.

  Shown only while the "Использовать прокси YouBoost" checkbox is on.

  Once a proxy has been obtained, this renders:
    * the current proxy (host:port),
    * an optional input where the user can paste their own proxy to be used
      while generating a new account (YouBoost grants one trial per IP),
    * a button that runs a full regeneration: new deviceId, new account, new
      trial, new proxy.
*/

export default function getYouboostEditor(theState) {

  const scopedCss = css`
    .container {
      padding: 0.4em 0 0.6em 0;
      width: 100%;
    }
    .current {
      margin-bottom: 0.4em;
    }
    .current code {
      font-size: 1.05em;
    }
    .row {
      display: flex;
      align-items: center;
      margin: 0.3em 0;
    }
    .row input[type="text"] {
      flex-grow: 1;
      min-width: 0;
      margin-right: 0.4em;
    }
    .hint {
      color: #666;
      font-size: 0.85em;
    }
    .error {
      color: darkred;
    }
    .ok {
      color: darkgreen;
    }
  `;

  return class YouboostEditor extends Component {

    constructor(props) {

      super(props);
      const bg = theState.bg;
      this.state = {
        proxySchemeInput: '',
        ifBusy: false,
        message: '',
        ifError: false,
        currentProxy: '',
      };
      this.refreshCurrent = this.refreshCurrent.bind(this);
      this.handleGenerate = this.handleGenerate.bind(this);
      this.handleInput = this.handleInput.bind(this);

    }

    componentDidMount() {

      this.refreshCurrent();

    }

    async refreshCurrent() {

      const record = await theState.bg.call('apis.youboost.getProxyStringRecord');
      this.setState({
        currentProxy: record ? (record.host + ':' + record.port) : '',
      });

    }

    handleInput(event) {

      this.setState({ proxySchemeInput: event.target.value });

    }

    async handleGenerate() {

      this.setState({ ifBusy: true, message: '', ifError: false });

      try {

        const record = await theState.bg.call(
          'apis.youboost.generateNewAsync',
          { proxyScheme: this.state.proxySchemeInput.trim() },
        );

        /*
          The new proxy is now cached; re-cook the PAC script so traffic goes
          through it, then refresh the whole popup state.
        */
        await theState.bg.call('apis.pacKitchen.keepCookedNowAsyncPromise');
        await this.props.funs.reloadState();
        await this.refreshCurrent();

        this.setState({
          ifBusy: false,
          ifError: false,
          message: 'Готово: ' + record.host + ':' + record.port,
        });

      } catch (err) {

        this.setState({
          ifBusy: false,
          ifError: true,
          message: 'Ошибка: ' + (err && err.message || err),
        });

      }

    }

    render() {

      const { currentProxy, proxySchemeInput, ifBusy, message, ifError } = this.state;

      return (
        <div class={scopedCss.container}>
          <div class={scopedCss.current}>
            {currentProxy
              ? (<span>Текущий прокси YouBoost: <code>{currentProxy}</code></span>)
              : (<span class={scopedCss.hint}>Прокси ещё не получен.</span>)
            }
          </div>

          <div class={scopedCss.row}>
            <input
              type="text"
              placeholder="прокси для генерации (необязательно): SOCKS5 127.0.0.1:1080"
              value={proxySchemeInput}
              disabled={ifBusy}
              onInput={this.handleInput}
            />
            <input
              type="button"
              value={ifBusy ? 'Генерирую...' : 'Сгенерировать новые прокси'}
              disabled={ifBusy}
              onClick={this.handleGenerate}
            />
          </div>

          <div class={scopedCss.hint}>
            YouBoost выдаёт бесплатный доступ один раз на IP. Если он уже
            использован, укажите свой прокси — через него будет выполнена
            активация нового доступа.
          </div>

          {message && (
            <div class={ifError ? scopedCss.error : scopedCss.ok}>{message}</div>
          )}
        </div>
      );

    }

  };

};
