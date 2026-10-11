<div class="about">
    <button title="Close" on:click={close}>✕</button>
    <h2>{title} by {MAKER}</h2>
    <p>👋 We'd love to hear your feedback, suggestions, or questions!</p>
    <p>
        Reach out to <a href="mailto:{EMAIL}">{EMAIL}</a> or visit
        <a href={SITE} target="_blank" rel="noopener">{SITE}</a>
    </p>
</div>

<script lang="ts">
    const MAKER = 'Appd';
    const EMAIL = 'hello@appd.com.au';
    const SITE = 'https://appd.com.au';

    export let title: string;
    export let close: () => void;
</script>

<style lang="less">
    .about {
        position: relative;
        padding: 22px 26px 12px;
        color: #cfcde6;
        font-size: 15px;
        line-height: 1.5;
    }

    h2 {
        margin: 0 28px 14px 0;
        color: #ffdf9e;
        font-size: 18px;
        font-weight: bold;
        line-height: 1.3;
    }

    p {
        margin: 0 0 12px;
    }

    a {
        color: #a9c8ff;
        text-decoration: underline;
    }

    button {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 26px;
        height: 26px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        color: inherit;
        font-size: 14px;
        cursor: pointer;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
        }
    }
</style>
