import Inferno from 'inferno';
import Component from 'inferno-component';

export default function getLastUpdateDate(theState) {

  /*
    MV3: the last-update stamp arrives in the connect-time snapshot and is
    refreshed whenever the worker writes antiCensorRu to chrome.storage.
    The period is read from the snapshot too (it is a constant in the
    worker, so it never changes at runtime).
  */
  const snapshotState = theState.state || {};

  return class LastUpdateDate extends Component {

    constructor(props) {

      super(props);
      this.state = {
        lastPacUpdateStamp: snapshotState.lastPacUpdateStamp,
        pacUpdatePeriodInMinutes: snapshotState.pacUpdatePeriodInMinutes,
      };

    }

    componentWillMount() {

      this.onStorageChangedHandler = (changes) => {
        const ac = changes.antiCensorRu;
        if (ac && ac.newValue && ac.newValue.lastPacUpdateStamp) {
          this.setState({
            lastPacUpdateStamp: ac.newValue.lastPacUpdateStamp,
          });
        }
      };

      chrome.storage.onChanged.addListener( this.onStorageChangedHandler );

    }

    componentWillUnmount() {

      chrome.storage.onChanged.removeListener( this.onStorageChangedHandler );

    }

    getDate(antiCensorRu) {

      let dateForUser = chrome.i18n.getMessage('never');
      if( antiCensorRu.lastPacUpdateStamp ) {
        let diff = Date.now() - antiCensorRu.lastPacUpdateStamp;
        let units = chrome.i18n.getMessage('ms');
        const gauges = [
          [1000, chrome.i18n.getMessage('s')],
          [60,   chrome.i18n.getMessage('min')],
          [60,   chrome.i18n.getMessage('h')],
          [24,   chrome.i18n.getMessage('d')],
          [7,    chrome.i18n.getMessage('w')],
          [4,    chrome.i18n.getMessage('m')],
        ];
        for(const g of gauges) {
          const diffy = Math.floor(diff / g[0]);
          if (!diffy)
            break;
          diff = diffy;
          units = g[1];
        }
        dateForUser = diff + units + ' ' + chrome.i18n.getMessage('ago');
      }
      return {
        text: `${dateForUser} / ${antiCensorRu.pacUpdatePeriodInMinutes/60}${chrome.i18n.getMessage('h')}`,
        title: new Date(antiCensorRu.lastPacUpdateStamp).toLocaleString('ru-RU'),
      };

    }

    render(props) {

      const date = this.getDate({
        lastPacUpdateStamp: this.state.lastPacUpdateStamp,
        pacUpdatePeriodInMinutes: this.state.pacUpdatePeriodInMinutes,
      });
      return (<div>{chrome.i18n.getMessage('Updated')}: <span class="updateDate" title={date.title}>{ date.text }</span></div>);

    }

  };

};
