import Inferno from 'inferno';
import createElement from 'inferno-create-element';
import css from 'csjs-inject';

import getInfoLi from './InfoLi';
import getExcEditor from './ExcEditor';

export default function getExceptions(theState) {

  const scopedCss = css`

    .excMods {
      padding-top: 1em;
    }
    .excMods input#mods-ifMindExceptions:not(:checked) + * > label {
      color: red;
    }

  `;

  const InfoLi = getInfoLi(theState);
  const ExcEditor = getExcEditor(theState);

  return function Exceptions(props) {

      const applyMods = async (newMods) => {

        try {
          const { warns } = await props.apis.pacKitchen.keepCookedNowAsyncPromise(newMods);
          await props.funs.reloadState();
          (warns || []).filter((w) => w).forEach((w) => props.funs.showErrors(null, w));
          props.funs.setStatusTo('Применено.');
        } catch (err) {
          props.funs.showErrors(err, ...(err.warns || []));
        }

      };

      return props.flags.ifInsideOptionsPage
        ? (
        <div class="nowrap">
          Редактор исключений доступен только для <a href="chrome://newtab">вкладок</a>.
        </div>)
        : (<div>
          {createElement(ExcEditor, props)}
          <ul class={scopedCss.excMods}>
            {
              /*
                MV3: ordered configs come from the connect-time snapshot
                instead of a synchronous call into the worker.
              */
              ((props.state.orderedConfigs || {}).exceptions || []).map((conf) => {

                return <InfoLi
                  type="checkbox"
                  conf={conf}
                  idPrefix="mods-"
                  checked={conf.value}
                  disabled={props.ifInputsDisabled}
                  onClick={async (evt) => {

                    const oldMods = await props.apis.pacKitchen.getPacModsAsync();
                    oldMods[conf.key] = !conf.value;
                    applyMods(oldMods);

                  }}
                />;

              })
            }
            {
              !props.flags.ifMini && (
                <InfoLi
                  type="checkbox"
                  conf={{
                    label: '<span>Собирать <a data-in-bg="false" href="../errors-to-exc/index.html">последние ошибки</a> сайтов</span>',
                    key: 'lookupLastErrors',
                    desc: 'Собирать последние ошибки в запросах, чтобы вручную добавлять избранные из них в исключения.',
                  }}
                  checked={props.state.ifCollectingErrors}
                  onChange={async (event) => {

                    await props.bg.call(
                      'apis.lastNetErrors.__setIfCollecting',
                      event.target.checked,
                    );
                    await props.funs.reloadState();
                    props.funs.setStatusTo('Сделано.');

                  }}
                />
              )
            }
          </ul>
        </div>
      );

  };

};
