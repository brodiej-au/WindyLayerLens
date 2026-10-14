/**
 * Calls `onChange` whenever the main map's box moves or changes size on screen, every frame
 * while it slides. Returns a function that stops watching.
 *
 * The map is not told when this happens. Opening a right-hand pane such as the menu or
 * settings makes Windy slide the whole map 200px left with a CSS transition on one of its
 * parents, and the map keeps its size and its view, so only the page shows it.
 */
export const watchMapBox = (mapEl: HTMLElement, onChange: () => void): (() => void) => {
    const holders: Element[] = [];
    for (let el: Element | null = mapEl; el; el = el.parentElement) {
        holders.push(el);
    }
    // Only transitions end by themselves; an endless animation elsewhere on the page must not
    // keep this running
    const sliding = () =>
        holders.some(el => el.getAnimations().some(animation => 'transitionProperty' in animation));

    let frame = 0;
    const follow = () => {
        onChange();
        frame = sliding() ? requestAnimationFrame(follow) : 0;
    };
    const check = () => {
        if (!frame) {
            frame = requestAnimationFrame(follow);
        }
    };
    const onTransition = (e: TransitionEvent) => {
        if (e.target instanceof Node && e.target.contains(mapEl)) {
            check();
        }
    };

    // A class or style change on the map or a parent moves it at once, or starts a transition;
    // a transition can also start from a rule that matches elsewhere on the page
    const restyled = new MutationObserver(check);
    holders.forEach(el => restyled.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));
    const resized = new ResizeObserver(check);
    resized.observe(mapEl);
    document.addEventListener('transitionrun', onTransition, true);

    return () => {
        restyled.disconnect();
        resized.disconnect();
        document.removeEventListener('transitionrun', onTransition, true);
        cancelAnimationFrame(frame);
        frame = 0;
    };
};
