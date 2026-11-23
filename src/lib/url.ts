/** A query string with one parameter set: withParam('?a=1&i=2', 'i', '3') → 'a=1&i=3'. */
export function withParam(search: string, key: string, value: string): string {
	const params = new URLSearchParams(search);
	params.set(key, value);
	return params.toString();
}

/**
 * A named form action's URL that keeps the page's query string, so filters and return
 * links survive the post: actionUrl('?tag=a', 'flag') → '?tag=a&/flag'.
 */
export function actionUrl(search: string, name: string): string {
	const params = new URLSearchParams(search);
	for (const key of [...params.keys()]) if (key.startsWith('/')) params.delete(key);
	const query = params.toString();
	return `?${query ? `${query}&` : ''}/${name}`;
}
