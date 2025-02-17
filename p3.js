// Last edited by Dietrich Geisler 2024

var VSHADER_SOURCE = `    
    uniform mat4 u_ModelR;
    uniform mat4 u_ModelS;
    uniform mat4 u_Total;

    uniform mat4 u_World;
    uniform mat4 u_Camera;
    uniform mat4 u_Projection;

    attribute vec3 a_Position;
    attribute vec3 a_Normal;
    varying vec3 v_Normal;
    varying vec3 v_Position;

    attribute vec2 a_TexCoord;
    varying vec2 v_TexCoord;




    void main() {
        gl_Position =  u_Projection * u_Camera * u_World * u_Total * u_ModelS * u_ModelR * vec4(a_Position, 1.0);
        v_Position = a_Position;
        v_Normal = a_Normal;
        v_TexCoord = a_TexCoord;

    }
`

var FSHADER_SOURCE = `
    precision mediump float;
    // constant RGB color for the whole model
    uniform vec3 u_Color;
    uniform highp mat4 u_ModelR;
    uniform int u_Tex;
    uniform int u_Grid;


    uniform highp mat4 u_ModelS;

    uniform highp mat4 u_World;

    varying vec2 v_TexCoord;

    uniform sampler2D u_Texture;

    
    uniform highp mat4 u_Camera;
    uniform highp mat4 u_InverseTranspose;

    varying vec3 v_Normal;
    varying vec3 v_Position;

    uniform vec3 u_Light; // where the light is located
    uniform vec3 u_AmbientLight; // the lighting from the world
    uniform vec3 u_DiffuseColor; // the base color of the model
    uniform float u_SpecPower; // the specular "power" of the light on this model
    uniform vec3 u_SpecColor; // the specular color on this model

    mediump vec3 hom_reduce(mediump vec4 v) {
        // component-wise division of v
        return vec3(v) / v.w;
    }

    void main() {
        if (u_Grid > 0) {
            gl_FragColor = vec4(150, 150, 230, 0.9);
        }
        else if (u_Tex > 0) {
            // usual normal transformation
            vec3 worldNormal = normalize(mat3(u_InverseTranspose) * normalize(v_Normal));
            // usual position transformation
            vec3 worldPos = hom_reduce(u_World * u_ModelS * u_ModelR * vec4(v_Position, 1.0));

            // also transform the position into the camera space to calculate the specular
            vec3 cameraPos = hom_reduce(u_Camera * vec4(worldPos, 1.0));

            // calculate our light direction
            vec3 lightDir = normalize(u_Light - worldPos); // get the direction towards the light

            // first, calculate our diffuse light
            float diffuse = dot(lightDir, worldNormal);

            // second, calculate our specular highlight
            // see https://learnopengl.com/Lighting/Basic-Lighting for more details
            vec3 reflectDir = normalize(reflect(-lightDir, worldNormal)); // reflect the light past our normal

            // We need our reflection to be in Camera space
            // note that this is a direction rather than a normal
            // so we don't need an inverse transpose of the world->camera matrix
            // but we _do_ need to apply a linear operation, so we use mat3
            vec3 cameraReflectDir = normalize(mat3(u_Camera) * reflectDir);

            // Now, get the direction to the camera, noting that the camera is at 0, 0, 0 in camera space
            vec3 cameraDir = normalize(-cameraPos);

            // calculate the angle between the cameraDir and
            //   the reflected light direction _toward_ the camera(in camera space)
            float angle = max(dot(cameraDir, cameraReflectDir), 0.0);
            // calculate fall-off with power
            float specular = pow(angle, u_SpecPower);

            // finally, add our lights together
            // note that webGL will take the min(1.0, color) for us for each color component
            vec4 color = texture2D(u_Texture, v_TexCoord);
            vec3 colorVec3 = color.rgb;

            gl_FragColor = vec4((u_AmbientLight + diffuse) * colorVec3 + specular * u_SpecColor, 1.0);
        }
        else {
                // usual normal transformation
            vec3 worldNormal = normalize(mat3(u_InverseTranspose) * normalize(v_Normal));
            // usual position transformation
            vec3 worldPos = hom_reduce(u_World * u_ModelS * u_ModelR * vec4(v_Position, 1.0));

            // also transform the position into the camera space to calculate the specular
            vec3 cameraPos = hom_reduce(u_Camera * vec4(worldPos, 1.0));

            // calculate our light direction
            vec3 lightDir = normalize(u_Light - worldPos); // get the direction towards the light

            // first, calculate our diffuse light
            float diffuse = dot(lightDir, worldNormal);

            // second, calculate our specular highlight
            // see https://learnopengl.com/Lighting/Basic-Lighting for more details
            vec3 reflectDir = normalize(reflect(-lightDir, worldNormal)); // reflect the light past our normal

            // We need our reflection to be in Camera space
            // note that this is a direction rather than a normal
            // so we don't need an inverse transpose of the world->camera matrix
            // but we _do_ need to apply a linear operation, so we use mat3
            vec3 cameraReflectDir = normalize(mat3(u_Camera) * reflectDir);

            // Now, get the direction to the camera, noting that the camera is at 0, 0, 0 in camera space
            vec3 cameraDir = normalize(-cameraPos);

            // calculate the angle between the cameraDir and
            //   the reflected light direction _toward_ the camera(in camera space)
            float angle = max(dot(cameraDir, cameraReflectDir), 0.0);
            // calculate fall-off with power
            float specular = pow(angle, u_SpecPower);

            // finally, add our lights together
            // note that webGL will take the min(1.0, color) for us for each color component
            gl_FragColor = vec4(u_AmbientLight + diffuse * u_DiffuseColor + specular * u_SpecColor, 1.0);

        }

    }
`

// global hooks for updating data
var g_canvas
var gl
var g_modelR_ref
var g_modelS_ref
var g_world_ref
var g_camera_ref
var g_projection_ref
var g_total_ref
var g_inverse_transpose_ref

var g_light_ref
var g_ambient_light
var g_diffuse_color
var g_spec_power
var g_spec_color
var g_tex


// Matrices for two cubes
var g_model_matrix
var g_world_matrix
var g_total_matrix

var g_color_ref
var g_mesh_vertex_counts
var g_mesh_offsets

// Matrices for positioning the grid
var g_model_matrix_grid
var g_world_matrix_grid

// Camera position/lookat matrix
var g_camera_matrix

// Perspective Camera properties
var g_near
var g_far
var g_fovy
var g_aspect
var g_x
var g_y
var g_z
var g_angle
var g_light_x
var g_grid

var per = true

// Previous frame time, used for calculating framerate
var g_last_frame_ms

// calculated grid vertex count
var g_grid_vertex_count

// Constants for setup
const INITIAL_CAMERA_X = 0
const INITIAL_CAMERA_Y = 0
const INITIAL_CAMERA_Z = 0

const INITIAL_NEAR = 1
const INITIAL_FAR = 20
const INITIAL_FOVY = 70
const INITIAL_ASPECT = 1
const INITIAL_ANGLE = 0

// Cube setup offsets for rotating around a center point
const RED_Z_OFFSET = -4
const BLUE_Z_OFFSET = -2



var NOSE_MESH = [
    0.0,  0.0,   1.0,
    1.0,  1.0,  -1.0,
   -1.0,  1.0,  -1.0,

    0.0,  0.0,   1.0,
    -1.0,  1.0,  -1.0,
   -1.0,  -1.0,  -1.0,

    0.0,  0.0,  1.0,
    -1.0,  -1.0,  -1.0,
    1.0,  -1.0,  -1.0,

    0.0,  0.0,  1.0,
    1.0,  -1.0,  -1.0,
    1.0,  1.0,  -1.0,
]

var NOSE_VERTEX_COUNT = 12;

var CUBE_MESH = [
    // front face
     1.0,  1.0,  1.0,
    -1.0,  1.0,  1.0,
    -1.0, -1.0,  1.0,

     1.0,  1.0,  1.0,
    -1.0, -1.0,  1.0,
     1.0, -1.0,  1.0,

    // back face
    1.0,  1.0, -1.0,
    -1.0, -1.0, -1.0,
    -1.0,  1.0, -1.0,

    1.0,  1.0, -1.0,
    1.0, -1.0, -1.0,
    -1.0, -1.0, -1.0,

    // right face
     1.0,  1.0,  1.0,
     1.0, -1.0, -1.0,
     1.0,  1.0, -1.0,

     1.0,  1.0,  1.0,
     1.0, -1.0,  1.0,
     1.0, -1.0, -1.0,

    // left face
    -1.0,  1.0,  1.0,
    -1.0,  1.0, -1.0,
    -1.0, -1.0, -1.0,

    -1.0,  1.0,  1.0,
    -1.0, -1.0, -1.0,
    -1.0, -1.0,  1.0,

    // top face
     1.0,  1.0,  1.0,
     1.0,  1.0, -1.0,
    -1.0,  1.0, -1.0,

     1.0,  1.0,  1.0,
    -1.0,  1.0, -1.0,
    -1.0,  1.0,  1.0,

    // bottom face
     1.0, -1.0,  1.0,
    -1.0, -1.0, -1.0,
     1.0, -1.0, -1.0,

     1.0, -1.0,  1.0,
    -1.0, -1.0,  1.0,
    -1.0, -1.0, -1.0,
]

var CUBE_VERTEX_COUNT = 36



var BODY_MESH
var BODY_VERTEX_COUNT

var ARM_MESH
var ARM_VERTEX_COUNT

var FOOT_MESH
var FOOT_VERTEX_COUNT

var ROD_MESH
var ROD_TEXT

var ROD_VERTEX_COUNT

var BOB_MESH
var BOB_VERTEX_COUNT

var keydownW
var keydownA
var keydownS
var keydownD
var keydownX
var keydownZ
var keydownT
var keydownY

var pointerDown

var curY
var angle_rod = 9
var last_rod_angle = 0

var ROD_NOR



document.addEventListener('keydown', onKeyDown, false);
document.addEventListener('keyup', onKeyUp, false);
document.addEventListener('mousedown', function (e) { curY = e.pageY; pointerDown = true }, false)
document.addEventListener('mousemove', onPointerMove, false)
document.addEventListener('mouseup', function (e) {pointerDown = false }, false)



function onKeyDown(e){
    if (e.key == ' ') per = !per; 
    else if (e.key == 'w') keydownW  = true
    else if (e.key == 'a') keydownA  = true
    else if (e.key == 's') keydownS  = true
    else if (e.key == 'd') keydownD  = true
    else if (e.key == 'x') keydownX  = true
    else if (e.key == 'z') keydownZ  = true
    else if (e.key == 't') keydownT  = true
    else if (e.key == 'y') keydownY  = true

}

function onKeyUp(e){
    if (e.key == 'w') keydownW = false
    else if (e.key == 'a') keydownA  = false
    else if (e.key == 's') keydownS  = false
    else if (e.key == 'd') keydownD  = false
    else if (e.key == 'x') keydownX = false
    else if (e.key == 'z') keydownZ  = false
    else if (e.key == 't') keydownT = false
    else if (e.key == 'y') keydownY  = false
}



function onPointerMove(e){
    if (pointerDown) {
        angle_rod = Math.max(Math.min(angle_rod + (e.pageY - curY)/50, 9), 0)
        curY = e.pageY
    }
    
}

function main() {



    BODY_MESH = getVARR('body')[0]
    BODY_VERTEX_COUNT = BODY_MESH.length/3;

    ARM_MESH = getVARR('arm')[0]
    ARM_VERTEX_COUNT = ARM_MESH.length/3;

    FOOT_MESH = getVARR('foot')[0]
    FOOT_VERTEX_COUNT = FOOT_MESH.length/3;

    [ROD_MESH, ROD_TEXT, ROD_NOR] = getVARR('rod')
    ROD_VERTEX_COUNT = ROD_MESH.length/3;




    BOB_MESH = getVARR('bob')[0]
    BOB_VERTEX_COUNT = BOB_MESH.length/3;


    

    g_canvas = document.getElementById('webgl');

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true)
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL')
        return
    }

    // Initialize GPU's vertex and fragment shaders programs
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }

    // get the VBO handle
    var VBOloc = gl.createBuffer();
    if (!VBOloc) {
        console.log('Failed to create the vertex buffer object')
        return -1
    }

    // get the grid mesh and colors
    // use a spacing of 1 for now, for a total of 200 lines
    // use a simple green color
    grid_data = build_grid_attributes(1, 1, [0.941, 0.961, 1.0])
    grid_mesh = grid_data[0]
    grid_color = grid_data[1]

    // setup two cubes of different colors and a grid
    // reusing the cube_mesh here is a bit lazy, but it makes our life easier later
    var attributes = grid_mesh.concat(BODY_MESH).concat(ARM_MESH).concat(FOOT_MESH).concat(ROD_MESH).concat(NOSE_MESH).concat(CUBE_MESH).concat(BOB_MESH)
    var vc = attributes.length


    attributes = attributes.concat(grid_color)
    attributes = attributes.concat(computeNormals(BODY_MESH))
    attributes = attributes.concat(computeNormals(ARM_MESH).map((x) => -x))
    attributes = attributes.concat(computeNormals2(FOOT_MESH).map((x) => -x))
    attributes = attributes.concat(ROD_NOR)
    attributes = attributes.concat(computeNormals(NOSE_MESH))
    attributes = attributes.concat(computeNormals(CUBE_MESH))
    attributes = attributes.concat(computeNormals(BOB_MESH))

    attributes = attributes.concat(new Array(g_grid_vertex_count*2))
    attributes = attributes.concat(new Array(BODY_VERTEX_COUNT*2))
    attributes = attributes.concat(new Array(ARM_VERTEX_COUNT*2))
    attributes = attributes.concat(new Array(FOOT_VERTEX_COUNT*2))
    attributes = attributes.concat(ROD_TEXT)
    attributes = attributes.concat(new Array(NOSE_VERTEX_COUNT*2))
    attributes = attributes.concat(new Array(CUBE_VERTEX_COUNT*2))
    attributes = attributes.concat(new Array(BOB_VERTEX_COUNT*2))








    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attributes), gl.STATIC_DRAW)

    // put the attributes on the VBO
    if (setup_vec('a_Position', 3, 0) < 0) {
        return -1
    }


    const FLOAT_SIZE = 4
    var vertex_count = vc * FLOAT_SIZE
    if (setup_vec('a_Normal', 3, vertex_count) < 0) {
        return -1
    }

    if (setup_vec('a_TexCoord', 2, vertex_count*2) < 0) {
        return -1
    }

    // get our uniform references
    g_modelR_ref = gl.getUniformLocation(gl.program, 'u_ModelR')
    g_modelS_ref = gl.getUniformLocation(gl.program, 'u_ModelS')
    g_total_ref = gl.getUniformLocation(gl.program, 'u_Total')
    g_inverse_transpose_ref = gl.getUniformLocation(gl.program, 'u_InverseTranspose')

    g_world_ref = gl.getUniformLocation(gl.program, 'u_World')
    g_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera')
    g_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection')
    g_color_ref = gl.getUniformLocation(gl.program, 'u_Color');
    g_grid = gl.getUniformLocation(gl.program, 'u_Grid');



    g_light_ref = gl.getUniformLocation(gl.program, 'u_Light')
    g_ambient_light = gl.getUniformLocation(gl.program, 'u_AmbientLight')
    g_diffuse_color = gl.getUniformLocation(gl.program, 'u_DiffuseColor')
    g_spec_power = gl.getUniformLocation(gl.program, 'u_SpecPower')
    g_spec_color = gl.getUniformLocation(gl.program, 'u_SpecColor')
    g_tex = gl.getUniformLocation(gl.program, 'u_Tex')


    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Fill the texture with a 1x1 blue pixel.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
              new Uint8Array([100, 100, 100, 255]));

    var image = new Image();
    image.src = "wood.png";
    image.addEventListener('load', function() {
        // Now that the image has loaded make copy it to the texture.
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D)
    });



    // Initially the camera is just the identity
    g_camera_matrix = new Matrix4()
    g_total_matrix = new Matrix4()

    // Initial values
    g_x = INITIAL_CAMERA_X
    g_y = INITIAL_CAMERA_Y
    g_z = INITIAL_CAMERA_Z

    g_near = INITIAL_NEAR
    g_far = INITIAL_FAR
    g_angle = INITIAL_ANGLE
    updateFOVY(INITIAL_FOVY)
    updateAspect(INITIAL_ASPECT)
    updateLightX(0)



    setup_models()
    setup_world()

    // Initial time
    g_last_frame_ms = Date.now()

    // Enable face culling and the depth test
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    g_mesh_vertex_counts = [g_grid_vertex_count, BODY_VERTEX_COUNT, ARM_VERTEX_COUNT, FOOT_VERTEX_COUNT, ROD_VERTEX_COUNT, NOSE_VERTEX_COUNT, CUBE_VERTEX_COUNT, BOB_VERTEX_COUNT]
    g_mesh_offsets = [0]
    

    for (i = 1; i < g_mesh_vertex_counts.length; i++){
        g_mesh_offsets.push(g_mesh_offsets[i-1]+ g_mesh_vertex_counts[i-1]);
    }

    tick()
}

const ROTATION_SPEED = .08

var g_arm_time = 0
var g_arm_direction =1
const ARM_ROTATION_SPEED = .025
const ARM_INIT_SPEED = .025
const ARM_PERIODICITY = 200

var g_body_time = 200
var g_body_direction =1
const BODY_ROTATION_SPEED = .01
const BODY_INIT_SPEED = .01
const BODY_PERIODICITY = 600


var g_rod_time = 150
var g_rod_direction = -1
const ROD_ROTATION_SPEED = 0.05
const ROD_INIT_SPEED = 0.05
const ROD_PERIODICTY = 300


var g_feet_time = 0
var g_feet_direction = 1
const FEET_ROTATION_SPEED = .025
const FEET_INIT_SPEED = .025
const FEET_PERIODICITY = 200


// update the cube rotations
function tick() {
    // var delta_time

    // calculate time since the last frame
    var current_time = Date.now()
    delta_time = current_time - g_last_frame_ms
    g_last_frame_ms = current_time
    if (keydownW) g_y = Math.min(g_y + (delta_time * 0.005), 3);
    if (keydownS) g_y = Math.max(g_y - (delta_time * 0.005), -1.5);
    if (keydownA) g_x = Math.max(g_x - (delta_time * 0.005), -3);
    if (keydownD) g_x = Math.min(g_x + (delta_time * 0.005), 3);
    if (keydownT) g_light_x = Math.max(g_light_x - (delta_time * 0.005), -3.5);
    if (keydownY) g_light_x = Math.min(g_light_x + (delta_time * 0.005), 3);


    if (keydownX) g_angle = Math.max(g_angle - (delta_time * 0.005), -3);
    if (keydownZ) g_angle = Math.min(g_angle + (delta_time * 0.005), 3);
    

    g_arm_time += delta_time
    if (g_arm_time > ARM_PERIODICITY) {
        g_arm_time -= ARM_PERIODICITY
        g_arm_direction = -g_arm_direction
    }
    angle_arm = ARM_ROTATION_SPEED * g_arm_direction * delta_time


    g_body_time += delta_time
    if (g_body_time > BODY_PERIODICITY) {
        g_body_time -= BODY_PERIODICITY
        g_body_direction = -g_body_direction
    }
    angle_body = BODY_ROTATION_SPEED * g_body_direction * delta_time


    g_rod_time += delta_time
    if (g_rod_time > ROD_PERIODICTY) {
        g_rod_time -= ROD_PERIODICTY
        g_rod_direction = -g_rod_direction
    }
    angle_rod_sway = ROD_ROTATION_SPEED * g_rod_direction * delta_time


    g_feet_time += delta_time
    if (g_feet_time > FEET_PERIODICITY) {
        g_feet_time -= FEET_PERIODICITY
        g_feet_direction = -g_feet_direction
    }
    angle_feet = FEET_ROTATION_SPEED * g_feet_direction * delta_time




    g_model_matrix[1][0].concat(new Matrix4().setRotate(-angle_arm, 0, 1, 0))
    g_model_matrix[0][0].concat(new Matrix4().setRotate(-angle_body, 0, 1, 0))
    g_model_matrix[1][0].concat(new Matrix4().setRotate(-angle_body, 0, 1, 0))
    g_model_matrix[2][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[3][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[4][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[5][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[6][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[7][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[8][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[9][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[10][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[11][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))
    g_model_matrix[12][0].concat(new Matrix4().setRotate(-angle_body, 1, 1, 1))

    g_model_matrix[4][0].concat(new Matrix4().setRotate(10*(angle_rod-last_rod_angle), 1, 0, 0))


    g_model_matrix[2][0].concat(new Matrix4().setRotate(-angle_feet, 1, 0, 0))
    g_model_matrix[3][0].concat(new Matrix4().setRotate(-angle_feet, 1, 0, 0))



    change_y = (Math.sin(toRadians(90-(10*angle_rod))) - Math.sin(toRadians(90-(10*last_rod_angle))) )* 0.9
    change_z = (Math.cos(toRadians(90-(10*angle_rod))) - Math.cos(toRadians(90-(10*last_rod_angle))) )* 0.5

    g_world_matrix[11].concat(new Matrix4().setTranslate(0, change_y, change_z))
    g_world_matrix[12].concat(new Matrix4().setTranslate(0, change_y, change_z))

    last_rod_angle = angle_rod


    draw()
}

// draw to the screen on the next frame
function draw() {
    // Update our perspective and camera matrices
    // Use the same perspective and camera for everything
    var camera_matrix = new Matrix4().lookAt(g_x, g_y, 1+g_z, g_x-g_angle, g_y, g_z, 0, 1, 0)

    gl.uniformMatrix4fv(g_camera_ref, false, camera_matrix.elements)

    gl.uniformMatrix4fv(g_total_ref, false, g_total_matrix.elements)
    var inv = new Matrix4(g_world_matrix[0]).concat(g_model_matrix[0][0]).concat(g_model_matrix[0][1]).invert().transpose()
    gl.uniformMatrix4fv(g_inverse_transpose_ref, false, inv.elements)


    gl.uniform3fv(g_light_ref, new Float32Array([g_light_x, 1, -2]))
    gl.uniform3fv(g_ambient_light, new Float32Array([0, 0, 0]))
    gl.uniform3fv(g_diffuse_color, new Float32Array([0.1, .5, .8]))
    gl.uniform1f(g_spec_power, 5.0)
    gl.uniform3fv(g_spec_color, new Float32Array([1, 1, 1]))



    var perspective_matrix = per ? new Matrix4().setPerspective(g_fovy, g_aspect, g_near, g_far) : new Matrix4().setOrtho(-2, 2, -2, 2, g_near, g_far)
    gl.uniformMatrix4fv(g_projection_ref, false, perspective_matrix.elements)

    // Clear the canvas with a black background
    gl.clearColor(0.65, 0.85, 0.9, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)



    gl.uniform1i(g_grid, 1)

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix_grid.elements)
    gl.uniformMatrix4fv(g_modelS_ref, false,  new Matrix4().elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix_grid.elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([0.85, 0.85, 0.95]));
    gl.drawArrays(gl.LINES, g_mesh_offsets[0], g_mesh_vertex_counts[0])

    gl.uniform1i(g_grid, 0)


    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[0][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[0][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[0].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([0.15, 0.15, 0.15]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[1], g_mesh_vertex_counts[1])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[1][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[1][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[1].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([0.20, 0.20, 0.20]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[2], g_mesh_vertex_counts[2])



    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[2][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[2][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[2].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([.9, .3, 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[3], g_mesh_vertex_counts[3])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[3][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[3][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[3].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([.9, .3, 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[3], g_mesh_vertex_counts[3])


    gl.uniform1i(g_tex, 1)
    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[4][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[4][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[4].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([196/255, 164/255, 132/255]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[4], g_mesh_vertex_counts[4])
    gl.uniform1i(g_tex, 0)



    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[5][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[5][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[5].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([.9, .3, 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[5], g_mesh_vertex_counts[5])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[6][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[6][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[6].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([1., 1., 1.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[6], g_mesh_vertex_counts[6])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[7][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[7][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[7].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([1., 1., 1.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[6], g_mesh_vertex_counts[6])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[8][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[8][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[8].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([1., 1., 1.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[6], g_mesh_vertex_counts[6])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[9][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[9][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[9].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([0., 0., 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[6], g_mesh_vertex_counts[6])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[10][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[10][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[10].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([0., 0., 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[6], g_mesh_vertex_counts[6])

    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[11][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[11][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[11].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([0., 0., 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[6], g_mesh_vertex_counts[6])


    gl.uniformMatrix4fv(g_modelR_ref, false, g_model_matrix[12][0].elements)
    gl.uniformMatrix4fv(g_modelS_ref, false, g_model_matrix[12][1].elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix[12].elements)
    gl.uniform3fv(g_diffuse_color, new Float32Array([1., 0., 0.]));
    gl.drawArrays(gl.TRIANGLES, g_mesh_offsets[7], g_mesh_vertex_counts[7])

    requestAnimationFrame(tick, g_canvas)
}



function updateFOVY(amount) {
    g_fovy = Number(amount)
}

function updateLightX(amount) {

    g_light_x = Number(amount)
}

function updateAspect(amount) {

    g_aspect = Number(amount)
}

function setup_vec(name, dimensions, offset) {
    // Get the attribute
    var attributeID = gl.getAttribLocation(gl.program, `${name}`)
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`)
        return -1;
    }

    // Set how the GPU fills the a_Position variable with data from the GPU 
    gl.vertexAttribPointer(attributeID, dimensions, gl.FLOAT, false, 0, offset)
    gl.enableVertexAttribArray(attributeID)

    return 0
}


// Helper to construct colors
// makes every triangle a slightly different shade of blue
function build_color_attributes(red, vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            // go from 0 -> n "smoothly"
            var shade = (i * 3) / vertex_count
            // use red or blue as our constant 1.0
            if (red) {
                colors.push(1.0, shade, shade)
            }
            else {
                colors.push(shade, shade, 1.0)
            }
        }
    }
    return colors
}

// How far in the X and Z directions the grid should extend
// Recall that the camera "rests" on the X/Z plane, since Z is "out" from the camera
const GRID_X_RANGE = 100
const GRID_Z_RANGE = 100

// Helper to build a grid mesh and colors
// Returns these results as a pair of arrays
// Each vertex in the mesh is constructed with an associated grid_color
function build_grid_attributes(grid_row_spacing, grid_column_spacing, grid_color) {
    if (grid_row_spacing < 1 || grid_column_spacing < 1) {
        console.error("Cannot have grid spacing less than 1")
        return [[], []]
    }
    var mesh = []
    var colors = []

    // Construct the rows
    for (var x = -GRID_X_RANGE; x < GRID_X_RANGE; x += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(x, 0, -GRID_Z_RANGE)
        mesh.push(x, 0, GRID_Z_RANGE)
    }

    // Construct the columns extending "outward" from the camera
    for (var z = -GRID_Z_RANGE; z < GRID_Z_RANGE; z += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(-GRID_X_RANGE, 0, z)
        mesh.push(GRID_X_RANGE, 0, z)
    }

    // directly store the number of vertices
    g_grid_vertex_count = mesh.length / 3

    // We need one color per vertex
    // since we have 3 components for each vertex, this is length/3
    for (var i = 0; i < mesh.length / 3; i++) {
        colors.push(grid_color[0], grid_color[1], grid_color[2])
    }

    return [mesh, colors]
}


function setup_models(){

    var body = [new Matrix4().setRotate(-90, 1, 0, 0), new Matrix4().setScale(50, 50, 50)]
    var arm = [new Matrix4().setRotate(180, 0, 1, 0), new Matrix4().setScale(45, 50, 50)]
    var foot = [new Matrix4().setRotate(-15, 0, 1, 0), new Matrix4().setScale(30, 45, 45)]
    var foot2 = [new Matrix4().setRotate(15, 0, 1, 0), new Matrix4().setScale(30, 45, 45)]
    var rod = [new Matrix4(), new Matrix4().setScale(.4, .8, .4)]
    var nose = [new Matrix4(), new Matrix4().setScale(0.1, 0.04, 0.15)]
    var stomach = [new Matrix4(), new Matrix4().setScale(0.25, 0.35, 0.05)]
    var eye = [new Matrix4(), new Matrix4().setScale(0.05, 0.05, 0.05)]
    var eye2 = [new Matrix4(), new Matrix4().setScale(0.05, 0.05, 0.05)]
    var pupil = [new Matrix4(), new Matrix4().setScale(0.03, 0.03, 0.03)]
    var pupil2 = [new Matrix4(), new Matrix4().setScale(0.03, 0.03, 0.03)]
    var line = [new Matrix4(), new Matrix4().setScale(0.008, 0.6, 0.008)]
    var bob = [new Matrix4(), new Matrix4().setScale(0.04, 0.04, 0.04)]



    g_model_matrix_grid = new Matrix4()



    g_model_matrix = [body, arm, foot, foot2, rod, nose, stomach, eye, eye2, pupil, pupil2, line, bob]

}

function setup_world(){
    var red = new Matrix4().translate(0, 0, RED_Z_OFFSET)
    // var blue = new Matrix4().translate(0, 0, BLUE_Z_OFFSET)

    var body = new Matrix4().setTranslate(0, -1, -2.6)
    var arm = new Matrix4().setTranslate(0, -1.25, -2.6)
    var foot = new Matrix4().setTranslate(-0, -1.05, -2.6)
    var foot2 = new Matrix4().setTranslate(0.35, -1.05, -2.72)
    var rod = new Matrix4().setTranslate(-0.05, 0, -1.5)
    var nose = new Matrix4().setTranslate(0, 0.1, -1.75)
    var stomach = new Matrix4().setTranslate(0, -0.4, -2)
    var eye = new Matrix4().setTranslate(-0.2, 0.25, -2.01)
    var eye2 = new Matrix4().setTranslate(0.2, 0.25, -2.01)
    var pupil = new Matrix4().setTranslate(-0.19, 0.24, -1.98)
    var pupil2 = new Matrix4().setTranslate(0.19, 0.24, -1.98)
    var line= new Matrix4().setTranslate(-0.03, 0.365, -1.43)
    var bob= new Matrix4().setTranslate(-0.05, -0.33, -1.43)





    g_world_matrix_grid = new Matrix4().translate(0, -1, 0)


    g_world_matrix = [body, arm, foot, foot2, rod, nose, stomach, eye, eye2, pupil, pupil2,line, bob]


}

function toRadians (angle) {
    return angle * (Math.PI / 180);
  }

function bobColor(bob) {
    var color = []
    for(var i = 1; i < bob.length; i+=3){
        if (bob[i] <= 0.4) color = color.concat([1, 0, 0])
        else color = color.concat([1, 1, 1])

    }
    return color
}

function computeNormals(vertices) {
    let verticesArray = [];
    for (let i = 0; i < vertices.length; i += 3) {
        verticesArray.push([parseFloat(vertices[i]), parseFloat(vertices[i + 1]), parseFloat(vertices[i + 2])]);
    }


    let normals = new Array(verticesArray.length).fill().map(() => [0, 0, 0]);

    let vertexMap = new Map();

    function getVertexKey(v) {
        return `${v[0].toFixed(6)},${v[1].toFixed(6)},${v[2].toFixed(6)}`;
    }

    let center = verticesArray.reduce((acc, v) => add(acc, v), [0, 0, 0]);
    center = scale(center, 1 / verticesArray.length);

    for (let i = 0; i < verticesArray.length; i += 3) {
        let v1 = verticesArray[i];
        let v2 = verticesArray[i + 1];
        let v3 = verticesArray[i + 2];

        let edge1 = subtract(v2, v1);
        let edge2 = subtract(v3, v1);
        let faceNormal = normalize(crossProduct(edge1, edge2));

        [v1, v2, v3].forEach((v, idx) => {
            let key = getVertexKey(v);
            if (!vertexMap.has(key)) vertexMap.set(key, []);
            vertexMap.get(key).push(i + idx);
            normals[i + idx] = add(normals[i + idx], faceNormal);
        });
    }

    vertexMap.forEach(indices => {
        let averageNormal = [0, 0, 0];
        indices.forEach(idx => {
            averageNormal = add(averageNormal, normals[idx]);
        });
        averageNormal = normalize(averageNormal);

        indices.forEach(idx => {
            let vertex = verticesArray[idx];
            let toCenter = subtract(vertex, center);
            if (dotProduct(averageNormal, toCenter) < 0) {
                averageNormal = scale(averageNormal, -1)
            }
            normals[idx] = averageNormal;
        });
    });

    return normals.flat();
}

function subtract(v1, v2) {
    return [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
}

function crossProduct(v1, v2) {
    return [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
    ];
}

function dotProduct(v1, v2) {
    return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
}

function length(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v) {
    let len = length(v);
    return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
}

function add(v1, v2) {
    return [v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]];
}

function scale(v, factor) {
    return [v[0] * factor, v[1] * factor, v[2] * factor];
}



function computeNormals2(vertices) {
    let verticesArray = [];
    for (let i = 0; i < vertices.length; i += 3) {
        verticesArray.push([vertices[i], vertices[i + 1], vertices[i + 2]]);
    }

    let normals = new Array(verticesArray.length).fill().map(() => [0, 0, 0]);

    for (let i = 0; i < verticesArray.length; i += 3) {
        try {
            let v1 = verticesArray[i];
            let v2 = verticesArray[i + 1];
            let v3 = verticesArray[i + 2];

            let edge1 = subtract(v2, v1);
            let edge2 = subtract(v3, v1);

            let normal = crossProduct(edge2, edge1);

            let normalLength = length(normal);
            if (normalLength > 0) {
                normal = normalize(normal, normalLength);
            }

            let adjustFactor = 0.1; 

            normals[i] = [(normal[0]-v1[0])*adjustFactor + (1-adjustFactor)* normal[0],(normal[1]-v1[1])*adjustFactor + (1-adjustFactor)* normal[1], (normal[2]-v1[2])*adjustFactor + (1-adjustFactor)* normal[2]]
            normals[i + 1] = [(normal[0]-v2[0])*adjustFactor + (1-adjustFactor)* normal[0],(normal[1]-v2[1])*adjustFactor + (1-adjustFactor)* normal[1], (normal[2]-v2[2])*adjustFactor + (1-adjustFactor)* normal[2]]
            normals[i + 2] = [(normal[0]-v3[0])*adjustFactor + (1-adjustFactor)* normal[0],(normal[1]-v3[1])*adjustFactor + (1-adjustFactor)* normal[1], (normal[2]-v3[2])*adjustFactor + (1-adjustFactor)* normal[2]]
        } catch (e) {
            break;
        }
    }

    for (let i = 0; i < normals.length; i++) {
        let normalLength = length(normals[i]);
        if (normalLength > 0) {
            normals[i] = normalize(normals[i], normalLength);
        }
    }

    return normals.flat();
}

function scale(v, factor) {
    return [v[0] * factor, v[1] * factor, v[2] * factor];
}

