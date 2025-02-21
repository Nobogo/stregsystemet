// Fallback for WebKit: https://caniuse.com/requestidlecallback
// TODO: remove this crap as soon as WebKit supports the real deal
const requestIdleCallback =
	globalThis.requestIdleCallback ??
	((func, { timeout }) => {
		const maxWait = Math.min(timeout ?? Infinity, 100);
		return setTimeout(func, maxWait);
	});
const cancelIdleCallback = globalThis.cancelIdleCallback ?? clearTimeout;

// The minimum amount of time that CSS animations should be buffered for
const minAnimationBuffer = 5_000;
// The maximum amount of time that CSS animations should be buffered for
const maxAnimationBuffer = 10_000;
// Make this bigger to make bats go faster
const speedMultiplier = 150;

// The HTML container that our bats exist in
const container = document.querySelector("#bat-container");

// The ID of the timeout that is currently waiting to call `pointAndShoot`
let timeoutId;
// A queue of all the bats, ordered by when they will need new coordinates
const batQueue = [];

// Initial setup of the bats queue
for (const element of container.querySelectorAll(".bat")) {
	batQueue.push({
		element,
		nextFly: 0,
	});
}

// Ensure that we disable this stuff if the user prefers reduced motion,
// or if the user is not looking at the page
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion)");
prefersReducedMotion.addEventListener("change", handleStationaryChange);
document.addEventListener("visibilitychange", handleStationaryChange);
handleStationaryChange();
function handleStationaryChange() {
	if (prefersReducedMotion.matches || document.visibilityState === "hidden") {
		pauseShooting();
	} else {
		resumeShooting();
	}
}
/**
 * Makes sure everything stops running and removes any animations.
 */
function pauseShooting() {
	// Let CSS know to stop moving
	container.classList.add("stationary");
	// Stop shooting bats around
	clearTimeout(timeoutId);
	cancelIdleCallback(timeoutId);
	timeoutId = undefined;
}
/**
 * Kickstarts everything again.
 */
function resumeShooting() {
	// Let CSS know to start moving again
	container.classList.remove("stationary");
	// Start shooting bats around again
	prepareNextShot();
}

/**
 * Call this function to ensure that bats are getting new coordinates.
 * DO NOT call the `pointAndShoot` function directly, as that might
 * cause two functions to be running simultaneously.
 */
function prepareNextShot() {
	if (timeoutId !== undefined) {
		return;
	}
	const bat = batQueue[0];
	const timeToNextFly = Math.max(0, bat.nextFly - Date.now());
	if (timeToNextFly < 10) {
		// If the bat needs new coordinates RIGHT NOW, schedule it quick
		// with a very short timeout.
		// We do not run it directly, as running this back-to-back 30 times
		// in a row would block user input and make the page feel janky.
		timeoutId = setTimeout(pointAndShoot, 0);
	} else if (timeToNextFly < maxAnimationBuffer) {
		// If the bat needs new coordinates sometime before the max buffer time,
		// schedule an idle callback, so it doesn't interfere with more important tasks.
		timeoutId = requestIdleCallback(pointAndShoot, { timeout: timeToNextFly });
	} else {
		// If the bat needs new coordinates later than our max buffer time,
		// take a chill pill and schedule a timeout that wakes us up when
		// we get close to our min buffer time limit.
		timeoutId = setTimeout(() => {
			timeoutId = undefined;
			prepareNextShot();
		}, timeToNextFly - minAnimationBuffer);
	}
}
/**
 * Generates a list of bats that are close to the bat
 * @param {bat} bat The bat we want to check from
 * @param {bat} other another bat
 * @param {number} distance The radius around the bat
 */
function isClose(bat, other, distance){
	return (bat.x - other.x)**2 + (bat.y - other.y)**2 < distance**2
}
/**
 * Gives the next bat in the queue some new coordinates.
 * DO NOT call this directly, call `prepareNextShot` instead.
 */
function pointAndShoot() {
	// Make it clear that a new timeout can be scheduled
	timeoutId = undefined;

	// Get the next bat in the queue.
	const bat = batQueue.shift();

	// On first load, we need to get the bat position from the HTML
	bat.x ??= Number(bat.element.style.getPropertyValue("--bat-x"));
	bat.y ??= Number(bat.element.style.getPropertyValue("--bat-y"));
	bat.vx ??= Number(bat.element.style.getPropertyValue("--bat-vx"));
	bat.vy ??= Number(bat.element.style.getPropertyValue("--bat-vy"));

	const turnFactor = 0.2
	const visualRange = 200
	const protectedRange = 20
	const avoidFactor = 0.05
	const alignFactor = 0.05
	const cohesionFactor = 0.0005
	const maxSpeed = 1
	const minSpeed = 0.3
	const updateTime = 100

	const leftMargin = 10
	const rightMargin = 100 - leftMargin
	const topMargin = 10
	const bottomMargin = 100 - topMargin

	let tooClose = batQueue.filter(other=>isClose(bat, other, protectedRange)&&other!==bat)
	let inRange = batQueue.filter(other=>isClose(bat, other, visualRange)&&other!==bat)
	if (tooClose.length > 0){
		let seperation = calculateSeperation(bat, tooClose)
		bat.vx += seperation.vx * avoidFactor
		bat.vy += seperation.vy * avoidFactor
	}
	if(inRange.length > 0){
		let alignment = calculateAlignment(bat, inRange)
		bat.vx += alignment.vx * alignFactor
		bat.vy += alignment.vy * alignFactor
		let cohesion = calculateCohesion(bat, inRange)
		bat.vx += cohesion.vx * cohesionFactor
		bat.vy += cohesion.vy * cohesionFactor
	}

	if (bat.x < leftMargin) bat.vx += turnFactor
	if (bat.x > rightMargin) bat.vx -= turnFactor
	if (bat.y < topMargin) bat.vy += turnFactor
	if (bat.y > bottomMargin) bat.vy -= turnFactor

	let speed = Math.sqrt(bat.vx ** 2 + bat.vy ** 2)
	if (speed > maxSpeed) {
		bat.vx *= maxSpeed / speed
		bat.vy *= maxSpeed / speed
	}
	else if (speed < minSpeed && speed !== 0) {
		bat.vx *= minSpeed / speed
		bat.vy *= minSpeed / speed
	}
	const flyTime = updateTime
	const now = Date.now();
	const batDirection =bat.vx >=0 ? 1 : -1
	bat.nextFly = Math.max(bat.nextFly, now);
	bat.element.animate(
		[
			{ "--bat-x": bat.x, "--bat-y": bat.y, "--bat-direction": batDirection },
			{ "--bat-x": (bat.x + bat.vx), "--bat-y": (bat.x + bat.vy), "--bat-direction": batDirection },
		],
		{
			delay: bat.nextFly - now,
			duration: flyTime,
			fill: "forwards",
		},
	);
	bat.nextFly += updateTime;
	bat.x += bat.vx;
	bat.y += bat.vy;



	// Put it back in the bats array.
	// Bats must be ordered such that the first element is always the next one that needs to be shot.
	let i;
	for (i = 0; i < batQueue.length; i++) {
		if (batQueue[i].nextFly > bat.nextFly) {
			break;
		}
	}
	batQueue.splice(i, 0, bat);

	// Move on to the next bat in need
	prepareNextShot();
}



/**
 *
 * @param {bat} bat
 * @param {bat[]} others
 */
function calculateSeperation(bat, others){
	let sepDx = 0
	let sepDy = 0
	others.forEach(other=> {sepDx += bat.x - other.x;
		                         sepDy += bat.y - other.y})
	return {'dx': sepDx, 'dy':sepDy}
}

function calculateAlignment(bat, others){
	let averageVelx = 0
	let averageVely = 0
	others.forEach(other=>{averageVelx += other.vx;
		                   averageVely += other.vy})
	averageVelx = averageVelx/others.length
	averageVely = averageVely/others.length
	return {'vx': averageVelx, 'vy': averageVely}
}
function calculateCohesion(bat, others){
	let averagex = 0
	let averagey = 0
	others.forEach(other=>{averagex += other.x;
		                   averagey += other.y})
	averagex = averagex/others.length
	averagey = averagey/others.length
	return {'vx': averagex, 'vy': averagey}
}


/**
 * Generates a new coordinate that is at least 2% different from
 * the previous, and at most 15% different.
 *
 * @param {number} previous - The previous coordinate.
 */
function newCoordinate(previous) {
	// The minimum amount it can change in percentage
	const min = 2;
	// The amount it can change beyond the minimum, in percentage
	const maxRange = 13;

	const change = min + maxRange * Math.random();
	let direction = Math.random() < 0.5 ? 1 : -1;
	let coordinate = previous + change * direction;
	// Make sure that the bat doesn't move outside the page
	if (coordinate < 0 || 100 < coordinate) {
		direction *= -1;
		coordinate = previous + change * direction;
	}
	return { coordinate, direction };
}

/**
 * Ensure that the value is somewhere between a min and max value.
 *
 * @param {number} min - The smallest permitted value.
 * @param {number} value - The value to clamp.
 * @param {number} max - The largest permitted value.
 */
function clamp(min, value, max) {
	return Math.max(min, Math.min(max, value));
}
