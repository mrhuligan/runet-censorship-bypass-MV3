import Inferno from 'inferno';
import Component from 'inferno-component';
import css from 'csjs-inject';

export default function getNotifications(theState) {

  const scopedCss = css`

    .listOfNotifiers {
      margin-left: 0.4em;
    }

  `;

  return class Notifications extends Component {

    constructor(props) {

      super(props);
      /*
        MV3: notifier state comes from the connect-time snapshot; toggling
        goes through the RPC bridge and updates local state.
      */
      const notifiers = (props.state && props.state.notifiers) || [];
      this.state = {
        notifiers,
        ifCheckedById: notifiers.reduce(
          (acc, [id, , ifOn]) => Object.assign(acc, { [id]: ifOn }),
          {},
        ),
      };
      this.handleToggle = this.handleToggle.bind(this);

    }

    handleToggle(id, ifOn) {

      this.setState({
        ifCheckedById: Object.assign({}, this.state.ifCheckedById, { [id]: ifOn }),
      });
      this.props.apis.errorHandlers.switch(ifOn ? 'on' : 'off', id);

    }

    render(props) {

      return (
        <section>
          <header>Я <span class="emoji" style="color: #f93a17">❤</span> yведомления:</header>
          <ul class={scopedCss.listOfNotifiers + ' middledChildren'}>
          {
            this.state.notifiers.map(([ntfId, ntfName]) => {

              const iddy = `if-on-${ntfId}`;
              const ifChecked = Boolean(this.state.ifCheckedById[ntfId]);
              return (
                <li>
                  <input
                    type="checkbox"
                    id={iddy}
                    checked={ifChecked}
                    disabled={props.ifInputsDisabled}
                    onChange={() => this.handleToggle(ntfId, !ifChecked)}
                  />
                  {' '}
                  <label for={iddy}>{ntfName}</label>
                </li>
              );

            })
          }
          </ul>
        </section>
      );

    }

  };

};
