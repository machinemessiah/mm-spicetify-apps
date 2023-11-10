export const updatePageCache = (i: any, callback: Function, activeOption: string, lib = false) => {
    let cacheInfo = Spicetify.LocalStorage.get("stats:cache-info");
    if (!cacheInfo) return;

    let cacheInfoArray = JSON.parse(cacheInfo);
    if (!cacheInfoArray[i]) {
        if (!lib) {
            ["short_term", "medium_term", "long_term"].filter(option => option !== activeOption).forEach(option => callback(option, true, false));
        }
        callback(activeOption, true);
        cacheInfoArray[i] = true;
        Spicetify.LocalStorage.set("stats:cache-info", JSON.stringify(cacheInfoArray));
    }
};


export const apiRequest = async (name: string, url: string, timeout = 10) => {
    let response;
    try {
        let timeStart = window.performance.now();
        response = await Spicetify.CosmosAsync.get(url);
        console.log("stats -", name, "fetch time:", window.performance.now() - timeStart);
    } catch (e) {
        console.error("stats -", name, "request failed:", e);
        console.log(url);
        if (timeout > 0) setTimeout(() => apiRequest(name, url, --timeout), 5000);
    }
    return response;
};


export const fetchAudioFeatures = async (ids: string[]) => {
    const batchSize = 100;
    const batches = [];

    ids = ids.filter(id => id.match(/^[a-zA-Z0-9]{22}$/));

    // Split ids into batches of batchSize
    for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        batches.push(batch);
    }

    // Send multiple simultaneous requests using Promise.all()
    const promises = batches.map((batch, index) => {
        const url = `https://api.spotify.com/v1/audio-features?ids=${batch.join(",")}`;
        return apiRequest("audioFeaturesBatch" + index, url);
    });

    const responses = await Promise.all(promises);

    // Merge responses from all batches into a single array
    const data = responses.reduce((acc, response) => {
        return acc.concat(response.audio_features);
    }, []);

    return data;
};

export const fetchTopAlbums = async (albums: Record<string, number>) => {

    let album_keys = Object.keys(albums)
        .filter(id => id.match(/^[a-zA-Z0-9]{22}$/))
        .sort((a, b) => albums[b] - albums[a])
    
    let release_years: Record<string, number> = {};
    let total_album_tracks = 0;
    
    let top_albums: any[] = await Promise.all(album_keys.map(async (albumID: string) => {
        const albumMeta = await Spicetify.GraphQL.Request(Spicetify.GraphQL.Definitions.getAlbum, {
            uri: `spotify:album:${albumID}`,
            locale: "en",
            offset: 0,
            limit: 50,
        });
    
        if (!albumMeta.data) return null;
    
        const releaseYear = albumMeta.data.albumUnion.date.isoString.slice(0, 4);
        release_years[releaseYear] = (release_years[releaseYear] || 0) + albums[albumID];
        total_album_tracks += albums[albumID];
        
        return({
            name: albumMeta.data.albumUnion.name,
            uri: albumMeta.data.albumUnion.uri,
            image: albumMeta.data.albumUnion.coverArt.sources[0].url,
            freq: albums[albumID],
        });
    }));

    top_albums = top_albums.filter(el => el != null).slice(0,10);
    return [top_albums, Object.entries(release_years), total_album_tracks];
};


export const fetchTopArtists = async (artists: Record<string, number>) => {
    if (Object.keys(artists).length === 0) return [[], [], 0];

    let artist_keys: any[] = Object.keys(artists)
        .filter(id => id.match(/^[a-zA-Z0-9]{22}$/))
        .sort((a, b) => artists[b] - artists[a])
        .slice(0, 50);
    let genres: Record<string, number> = {};
    let total_genre_tracks = 0;

    const artistsMeta = await apiRequest("artistsMetadata", `https://api.spotify.com/v1/artists?ids=${artist_keys.join(",")}`);

    let top_artists: any[] = artistsMeta?.artists?.map((artist: any) => {
        if (!artist) return null;

        artist.genres.forEach((genre: string) => {
            genres[genre] = (genres[genre] || 0) + artists[artist.id];
        });
        total_genre_tracks += artists[artist.id];

        return ({
            name: artist.name,
            uri: artist.uri,
            image: artist.images[2]?.url || "https://commons.wikimedia.org/wiki/File:Black_square.jpg",
            freq: artists[artist.id],
        });           
    })

    top_artists = top_artists.filter(el => el != null).slice(0,10);
    const top_genres = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return [top_artists, top_genres, total_genre_tracks];
};