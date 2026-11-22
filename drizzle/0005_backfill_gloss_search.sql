UPDATE dict_sense SET gloss_search = lower(array_to_string(glosses, ' ')) WHERE gloss_search = '';
