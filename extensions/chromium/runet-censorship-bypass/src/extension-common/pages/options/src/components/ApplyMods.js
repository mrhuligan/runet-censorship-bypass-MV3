import Inferno, { linkEvent } from 'inferno';

export default function getApplyMods(theState) {

  /*
    MV3: the background window is gone. confirm() runs on the page, and the
    "reset everything" sequence goes through the RPC bridge/worker helpers.
  */
  const resetMods = async function resetMods(props) {

    const ifSure = window.confirm('Сбросить все модификаторы и ИСКЛЮЧЕНИЯ?');
    if (!ifSure) {
      return false;
    }
    props.funs.conduct(
      'Сбрасываем...',
      async () => {

        await props.apis.pacKitchen.resetToDefaultsPromise();
        await props.bg.call('apis.ipToHost.resetToDefaultsPromise');
        window.localStorage.clear();

      },
      'Откройте окно заново для отображения эффекта.',
      () => window.close()
    );

  }

  return function ApplyMods(props) {

    return (
      <section class="controlRow horFlex" style="margin-top: 1em">
        <input type="button" value="Применить" disabled={props.ifInputsDisabled} onClick={props.onClick}/>
        <a href="" onClick={linkEvent(props, resetMods)}>К изначальным!</a>
      </section>
    );

  };

}
